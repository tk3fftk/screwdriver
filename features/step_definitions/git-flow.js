'use strict';
const Assert = require('chai').assert;
const request = require('../support/request');
const sdapi = require('../support/sdapi');
const github = require('../support/github');

/**
 * Promise to wait a certain number of seconds
 * @method promiseToWait
 * @param  {Number}      timeToWait  Number of seconds to wait before continuing the chain
 * @return {Promise}
 */
function promiseToWait(timeToWait) {
    return new Promise((resolve) => {
        setTimeout(() => resolve(), timeToWait * 1000);
    });
}

module.exports = function server() {
    // eslint-disable-next-line new-cap
    this.Before({
        tags: ['@gitflow'],
        timeout: 60000
    }, () => {
        this.instance = 'https://api.screwdriver.cd';
        this.branch = 'darrenBranch';
        this.repoOrg = 'screwdriver-cd-test';
        this.repoName = 'functional-git';
        this.pipelineId = '2e0138dfa7c4ff83720dc0cd510d2252a3398fc3';  // TODO: determine dynamically

        // Reset shared information
        this.pullRequestNumber = null;

        return request({  // TODO : perform this in the before-hook for all func tests
            method: 'GET',
            url: `${this.instance}/v4/auth/token?access_key=${this.accessKey}`,
            followAllRedirects: true,
            json: true
        }).then((response) => {
            this.jwt = response.body.token;
        }).then(() =>
            github.cleanUpRepository(this.gitToken, this.branch, this.repoOrg,
                this.repoName)
        );
    });

    this.Given(/^an existing pipeline$/, () =>
        request({
            uri: `${this.instance}/v4/pipelines`,
            method: 'POST',
            auth: {
                user: this.username,
                bearer: this.jwt
            },
            body: {
                scmUrl: `git@github.com:${this.repoOrg}/${this.repoName}.git#master`
            },
            json: true
        }).then((response) => {
            if (!this.pipelineId) {
                this.pipelineId = response.body.id;
            }

            Assert.oneOf(response.statusCode, [409, 201]);
        })
    );

    this.Given(/^an existing pull request targeting the pipeline's branch$/, () => {
        const branch = this.branch;
        const token = this.gitToken;

        return github.createBranch(token, branch, this.repoOrg, this.repoName)
            .then(() => github.createFile(token, branch, this.repoOrg, this.repoName))
            .then(() =>
                github.createPullRequest(token, branch, this.repoOrg, this.repoName)
            )
            .then((data) => {
                this.pullRequestNumber = data.number;
                this.sha = data.head.sha;
            })
            .catch((err) => {
                // throws an error if a PR already exists, so this is fine
                Assert.strictEqual(err.code, 422);
            });
    });

    this.When(/^a pull request is opened$/, () => {
        const branch = this.branch;
        const token = this.gitToken;

        return github.createBranch(token, branch, this.repoOrg, this.repoName)
            .then(() => github.createFile(token, branch, this.repoOrg, this.repoName))
            .then(() =>
                github.createPullRequest(token, branch, this.repoOrg, this.repoName)
            )
            .then((data) => {
                this.pullRequestNumber = data.number;
                this.sha = data.head.sha;
            });
    });

    this.When(/^it is targeting the pipeline's branch$/, () => null);

    this.When(/^the pull request is closed$/, {
        timeout: 60 * 1000
    }, () => {
        // Wait for the build to be enabled before moving forward

        return promiseToWait(3)
        .then(() => {
            console.log('ok');
            console.log({
                instance: this.instance,
                pipelineId: this.pipelineId,
                pullRequestNumber: this.pullRequestNumber,
                sha: this.sha,
                desiredStatus: ['RUNNING', 'SUCCESS', 'FAILURE']
            });

            return sdapi.searchForBuild({
                instance: this.instance,
                pipelineId: this.pipelineId,
                pullRequestNumber: this.pullRequestNumber,
                sha: this.sha,
                desiredStatus: ['RUNNING', 'SUCCESS', 'FAILURE']
            });
        }).then((buildData) => {
            this.previousBuildId = buildData.id;
        }).then(() => github.closePullRequest(this.gitToken, this.repoOrg, this.repoOwner,
                this.pullRequestNumber)
        );
    });

    this.When(/^new changes are pushed to that pull request$/, {
        timeout: 30 * 1000
    }, () => {
        // Find & save the previous build
        return promiseToWait(3)
        .then(() => {
            return sdapi.searchForBuild({
                instance: this.instance,
                pipelineId: this.pipelineId,
                pullRequestNumber: this.pullRequestNumber,
                sha: this.sha,
                desiredStatus: ['QUEUED', 'RUNNING', 'SUCCESS', 'FAILURE']
            }).then((buildData) => {
                console.log(buildData);

                this.previousBuildId = buildData.id;
            });
        })
        .then(() => github.createFile(this.gitToken, this.branch, this.repoOrg,
            this.repoName));
    });

    this.When(/^a new commit is pushed$/, () => null);

    this.When(/^it is against the pipeline's branch$/, () => {
        this.testBranch = 'master';

        return github.createFile(this.gitToken, this.testBranch, this.repoOrg, this.repoName);
    });

    this.Then(/^a new build from `main` should be created to test that change$/, {
        timeout: 60 * 1000
    }, () => {
        return promiseToWait(8)
        .then(() => sdapi.searchForBuild({
            instance: this.instance,
            pipelineId: this.pipelineId,
            pullRequestNumber: this.pullRequestNumber
        }))
        .then((data) => {
            const build = data;

            Assert.oneOf(build.status, ['QUEUED', 'RUNNING', 'SUCCESS']);

            this.jobId = build.jobId;
        });
    });

    this.Then(/^the build should know they are in a pull request/, () =>
        request({
            json: true,
            method: 'GET',
            uri: `${this.instance}/v4/jobs/${this.jobId}`
        })
        .then((response) => {
            Assert.strictEqual(response.statusCode, 200);
            Assert.match(response.body.name, /^PR-(.*)$/);
        })
    );

    this.Then(/^any existing builds should be stopped$/, {
        timeout: 60 * 1000
    }, () => {
        const desiredStatus = ['ABORTED', 'SUCCESS'];

        return sdapi.waitForBuildStatus({
            buildId: this.previousBuildId,
            instance: this.instance,
            desiredStatus
        }).then((buildData) => {
            // TODO: save the status so the next step can verify the github status

            Assert.oneOf(buildData.status, desiredStatus);
        });
    });

    this.Then(/^the GitHub status should be updated to reflect the build's status$/, () =>
        github.getStatus(this.gitToken, this.repoOrg, this.repoName, this.sha)
        .then((data) => {
            Assert.oneOf(data.state, ['success', 'pending']);
        })
    );
};

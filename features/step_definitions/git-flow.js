'use strict';
const Assert = require('chai').assert;
const Github = require('github');
const github = new Github();
const request = require('../support/request');
const sdapi = require('../support/sdapi');

const MAX_CONTENT_LENGTH = 354;
const MAX_FILENAME_LENGTH = 17;

/**
 * Creates a string of a given length with random alphanumeric characters
 * @method randomString
 * @param  {Number}     stringLength  Length of the string
 * @return {String}                   A string consisting of random characters
 */
function randomString(stringLength) {
    let content = '';
    const alphanumeric = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < stringLength; i++) {
        content += alphanumeric.charAt(Math.floor(Math.random() * alphanumeric.length));
    }

    return content;
}

/**
 * Create a branch on the given repository
 * @method createBranch
 * @param  {String}     token              Github token
 * @param  {String}     branchName         Name of the branch to create
 * @param  {String}     [repositoryOwner]  Owner of the repository
 * @param  {String}     [repositoryName]   Name of the repository
 * @return {Promise}
 */
function createBranch(token, branchName, repositoryOwner, repositoryName) {
    const user = repositoryOwner || 'screwdriver-cd';
    const repo = repositoryName || 'garbage-repository-ignore-this';

    // Branch creation requires authentication
    github.authenticate({
        type: 'oauth',
        token
    });

    // Create a branch from the tip of the master branch
    return github.gitdata.getReference({
        user,
        repo,
        ref: 'heads/master'
    })
    .then((referenceData) => {
        const sha = referenceData.object.sha;

        return github.gitdata.createReference({
            user,
            repo,
            ref: `refs/heads/${branchName}`,
            sha
        });
    });
}

/**
 * Creates a random file, with a random content.
 * @method createFile
 * @param  {String}   token              Github token
 * @param  {String}   branch             The branch to create the file in
 * @param  {String}   repositoryOwner    Owner of the repository
 * @param  {String}   repositoryName     Name of the repository
 * @return {Promise}
 */
function createFile(token, branch, repositoryOwner, repositoryName) {
    const content = new Buffer(randomString(MAX_CONTENT_LENGTH));
    const filename = randomString(MAX_FILENAME_LENGTH);
    const repo = repositoryName;
    const user = repositoryOwner;

    github.authenticate({
        type: 'oauth',
        token
    });

    return github.repos.createFile({
        user,
        repo,
        path: filename,
        message: (new Date()).toString(),    // commit message is the current time
        content: content.toString('base64'), // content needs to be transmitted in base64
        branch
    });
}

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

/**
 * Search for a build that is running in the PR
 * @method searchForBuild
 * @param  {String}       instance          Specific screwdriver instance to query against
 * @param  {String}       pipelineId        Pipeline ID
 * @param  {Number}       pullRequestNumber Pull request number
 * @return {Promise}
 */
function searchForBuild(instance, pipelineId, pullRequestNumber) {
    console.log('    (...searching for build...)');

    return request({
        json: true,
        method: 'GET',
        uri: `${instance}/v4/pipelines/${pipelineId}/jobs`
    })
    .then((response) => {
        const jobData = response.body;
        let result = [];

        if (pullRequestNumber) {
            result = jobData.filter((job) => job.name === `PR-${pullRequestNumber}`);
        } else {
            result = jobData.filter((job) => job.name === 'main');
        }

        if (result.length === 0) {
            return result;
        }

        const jobId = result[0].id;

        return request({
            json: true,
            method: 'GET',
            uri: `${instance}/v4/jobs/${jobId}/builds`
        });
    });
}

/**
 * Persistently ping the API until the build data is available
 * @method waitForBuild
 * @param  {String}     instance          Specific Screwdriver instance to query against
 * @param  {String}     pipelineId        Pipeline ID
 * @param  {Number}     pullRequestNumber Pull request number
 * @return {Promise}
 */
function waitForBuild(instance, pipelineId, pullRequestNumber) {
    console.log('    (Waiting for build to exist....)');
    console.log('pipeline id:  ', pipelineId);

    return searchForBuild(instance, pipelineId, pullRequestNumber)
    .then((buildData) => {
        if (buildData.length !== 0) {
            return buildData;
        }
        console.log('    (Searching for MOAR builds....)');

        return promiseToWait(3)
            .then(() => waitForBuild(instance, pipelineId, pullRequestNumber));
    });
}

/**
 * Look for a specific build. Wait until the build reaches the desired status
 * @method waitForBuildAndStatus
 * @return {[type]}              [description]
 */
function waitForBuildAndStatus(config) {
    const desiredSha = config.sha;
    const desiredStatus = config.desiredStatus;

    return searchForBuild(config.instance, config.pipelineId, config.pullRequestNumber)
    .then((buildData) => {
        if (buildData.length !== 0) {
            if (!desiredSha) {  // default is the first one
                return buildData.body[0];
            }

            let chosenBuild = -1;

            buildData.body.forEach((singleBuild, index) => {
                if (singleBuild.sha === desiredSha && desiredStatus.includes(singleBuild.status)) {
                    console.log('adding: ', singleBuild);
                    chosenBuild = index;
                }
            });

            if (chosenBuild >= 0) {
                return buildData.body[chosenBuild];
            }
        }

        console.log('   (Searching through MOAR builds...)');
        console.log(buildData);

        return promiseToWait(3).then(() => waitForBuildAndStatus(config));
    });
}

/**
 * [cleanUpRepository description]
 * @method cleanUpRepository
 * @param  {[type]}          orgName     [description]
 * @param  {[type]}          repoName    [description]
 * @param  {[type]}          testBranch  [description]
 * @return {[type]}                      [description]
 */
function cleanUpRepository(orgName, repoName, testBranchName) {
    const branchParams = {
        user: orgName,
        repo: repoName,
        ref: `heads/${testBranchName}`
    };

    return github.gitdata.getReference(branchParams)
        .then(() => github.gitdata.deleteReference(branchParams), () => {});
}

module.exports = function server() {
    // eslint-disable-next-line new-cap
    this.Before({
        tags: ['@gitflow']
    }, () => {
        this.instance = 'https://api.screwdriver.cd';
        this.branchName = 'darrenBranch';
        this.repoOrg = 'screwdriver-cd-test';
        this.repoName = 'functional-git';
        this.pipelineId = '2e0138dfa7c4ff83720dc0cd510d2252a3398fc3';  // TODO: determine dynamically

        // Github operations require
        github.authenticate({
            type: 'oauth',
            token: this.github_token
        });

        return request({  // TODO : perform this in the before-hook for all func tests
            method: 'GET',
            url: `${this.instance}/v4/auth/token?access_key=${this.accessKey}`,
            followAllRedirects: true,
            json: true
        }).then((response) => {
            this.jwt = response.body.token;
        }).then(() =>
            cleanUpRepository(this.repoOrg, this.repoName, this.branchName)
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
        const branchName = this.branchName;
        const token = this.github_token;

        return createBranch(token, branchName, this.repoOrg, this.repoName)
            .then(() => createFile(token, branchName, this.repoOrg, this.repoName))
            .then(() =>
                github.pullRequests.create({
                    user: this.repoOrg,
                    repo: this.repoName,
                    title: '[DNM] testing',
                    head: branchName,
                    base: 'master'
                })
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
        const branchName = this.branchName;
        const token = this.github_token;

        return createBranch(token, branchName, this.repoOrg, this.repoName)
            .then(() => createFile(token, branchName, this.repoOrg, this.repoName))
            .then(() =>
                github.pullRequests.create({
                    user: this.repoOrg,
                    repo: this.repoName,
                    title: '[DNM] testing',
                    head: branchName,
                    base: 'master'
                })
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
        // Closing a PR requires authentication
        github.authenticate({
            type: 'oauth',
            token: this.github_token
        });

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

            return waitForBuildAndStatus({
                instance: this.instance,
                pipelineId: this.pipelineId,
                pullRequestNumber: this.pullRequestNumber,
                sha: this.sha,
                desiredStatus: ['RUNNING', 'SUCCESS', 'FAILURE']
            });
        }).then((buildData) => {
            this.previousBuildId = buildData.id;
        }).then(() => {
            return github.pullRequests.update({
                user: this.repoOrg,
                repo: this.repoName,
                number: this.pullRequestNumber,
                state: 'closed'
            });
        });
    });

    this.When(/^new changes are pushed to that pull request$/, {
        timeout: 30 * 1000
    }, () => {
        console.log();

        // Find & save the previous build
        return promiseToWait(3)
        .then(() => {
            return waitForBuildAndStatus({
                instance: this.instance,
                pipelineId: this.pipelineId,
                pullRequestNumber: this.pullRequestNumber,
                sha: this.sha,
                desiredStatus: ['QUEUED', 'RUNNING', 'SUCCESS', 'FAILURE']
            }).then((buildData) => {
                this.previousBuildId = buildData.id;
            });
        })
        .then(() => createFile(this.github_token, this.branchName, this.repoOrg, this.repoName));
    });

    this.When(/^a new commit is pushed$/, () => null);

    this.When(/^it is against the pipeline's branch$/, () => {
        this.testBranch = 'master';

        return createFile(this.github_token, this.testBranch, this.repoOrg, this.repoName);
    });

    this.Then(/^a new build from `main` should be created to test that change$/, {
        timeout: 60 * 1000
    }, () => promiseToWait(8)
        .then(() => waitForBuild(this.instance, this.pipelineId, this.pullRequestNumber))
        .then((data) => {
            console.log(data);

            const build = data.body[0];

            Assert.oneOf(build.status, ['QUEUED', 'RUNNING', 'SUCCESS']);

            this.jobId = build.jobId;
        })
    );

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
        github.repos.getCombinedStatus({
            user: this.repoOrg,
            repo: this.repoName,
            sha: this.sha
        })
        .then((data) => {
            Assert.oneOf(data.state, ['success', 'pending']);
        })
    );
};

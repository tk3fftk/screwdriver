'use strict';
const request = require('./request');

/**
 * Promise to wait a certain number of seconds
 *
 * Might make this centralized for other tests to leverage
 *
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
 * [findBuild description]
 * @method findBuild
 * @param  {[type]}  config [description]
 * @return {[type]}         [description]
 */
function findBuilds(config) {
    const instance = config.instance;
    const pipelineId = config.pipelineId;
    const pullRequestNumber = config.pullRequestNumber;

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
 * [searchForBuild description]
 * @method searchForBuild
 * @param  {[type]}       config [description]
 * @return {[type]}              [description]
 */
function searchForBuild(config) {
    const instance = config.instance;
    const pipelineId = config.pipelineId;
    const pullRequestNumber = config.pullRequestNumber;
    const desiredSha = config.desiredSha;
    const desiredStatus = config.desiredStatus;

    return findBuilds({
        instance,
        pipelineId,
        pullRequestNumber
    }).then((buildData) => {
        let result = buildData.body || [];

        if (desiredSha) {
            result = result.filter((item) => item.sha === desiredSha);
        }

        if (desiredStatus) {
            result = result.filter((item) => desiredStatus.includes(item.status));
        }

        if (result.length > 0) {
            return result[0];
        }

        return promiseToWait(3).then(() => searchForBuild(config));
    });
}

/**
 * [waitForBuildStatus description]
 * @method waitForBuildStatus
 * @param  {[type]}         config [description]
 * @return {[type]}                [description]
 */
function waitForBuildStatus(config) {
    const buildId = config.buildId;
    const desiredStatus = config.desiredStatus;
    const instance = config.instance;

    return request({
        json: true,
        method: 'GET',
        uri: `${instance}/v4/builds/${buildId}`
    }).then((response) => {
        const buildData = response.body;

        if (desiredStatus.includes(buildData.status)) {
            return buildData;
        }

        return promiseToWait(3).then(() => waitForBuildStatus(config));
    });
}

module.exports = {
    searchForBuild,
    waitForBuildStatus
};

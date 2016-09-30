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
 * [waitForBuildStatus description]
 * @method waitForBuildStatus
 * @param  {[type]}         config [description]
 * @return {[type]}                [description]
 */
function waitForBuildStatus(config) {
    const buildId = config.buildId;
    const desiredStatus = config.desiredStatus;
    const instance = config.instance;

    console.log(buildId);

    return request({
        json: true,
        method: 'GET',
        uri: `${instance}/v4/builds/${buildId}`
    }).then((response) => {
        const buildData = response.body;

        if (desiredStatus.includes(buildData.status)) {
            return buildData;
        }

        console.log('waiting');
        console.log(buildData);

        return promiseToWait(3).then(() => waitForBuildStatus(config));
    });
}

module.exports = {
    waitForBuildStatus
};

'use strict';
const config = require('../../.func_config');

/**
 * Before hooks
 * @return
 */
function beforeHooks() {
    // eslint-disable-next-line new-cap
    this.Before((scenario, cb) => {
        this.accessKey = config.access_key || process.env.ACCESS_KEY;
        this.username = config.username || process.env.USER_NAME;
        this.gitToken = config.gitToken || process.env.ACCESS_TOKEN;
        cb();
    });
}

module.exports = beforeHooks;

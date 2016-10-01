'use strict';
const Github = require('github');
const github = new Github();

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
 * Clean up repository
 * @method cleanUpRepository
 * @param  {String}          token      Github token
 * @param  {String}          repoOwner  Owner of the repository
 * @param  {String}          repoName   Name of the repository
 * @param  {String}          branch     Name of the branch to delete
 * @return {Promise}
 */
function cleanUpRepository(token, branch, repoOwner, repoName) {
    const branchParams = {
        user: repoOwner,
        repo: repoName,
        ref: `heads/${branch}`
    };

    // Github operations require
    github.authenticate({
        type: 'oauth',
        token
    });

    return github.gitdata.getReference(branchParams)
        .then(() => github.gitdata.deleteReference(branchParams), () => {});
}

/**
 * Close a pull request for a given repository
 * @method closePullRequest
 * @param  {String}     token              Github token
 * @param  {String}     repoOwner          Owner of the repository
 * @param  {String}     repoName           Name of the repository
 * @param  {Number}     prNumber           Number of the pull request
 * @return {Promise}
 */
function closePullRequest(token, repoOwner, repoName, prNumber) {
    return github.pullRequests.update({
        user: repoOwner,
        repo: repoName,
        number: prNumber,
        state: 'closed'
    });
}

/**
 * Create a branch on the given repository
 * @method createBranch
 * @param  {String}     token              Github token
 * @param  {String}     branch             Name of the branch to create
 * @param  {String}     [repoOwner]        Owner of the repository
 * @param  {String}     [repoName]         Name of the repository
 * @return {Promise}
 */
function createBranch(token, branch, repoOwner, repoName) {
    const user = repoOwner || 'screwdriver-cd';
    const repo = repoName || 'garbage-repository-ignore-this';

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
            ref: `refs/heads/${branch}`,
            sha
        });
    });
}

/**
 * Creates a random file, with a random content.
 * @method createFile
 * @param  {String}   token             Github token
 * @param  {String}   branch            The branch to create the file in
 * @param  {String}   repoOwner         Owner of the repository
 * @param  {String}   repoName          Name of the repository
 * @return {Promise}
 */
function createFile(token, branch, repoOwner, repoName) {
    const content = new Buffer(randomString(MAX_CONTENT_LENGTH));
    const filename = randomString(MAX_FILENAME_LENGTH);
    const repo = repoName;
    const user = repoOwner;

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
 * Creates a pull request.
 * @method createPullRequest
 * @param  {String}   token             Github token
 * @param  {String}   branch            The branch to create the file in
 * @param  {String}   repoOwner         Owner of the repository
 * @param  {String}   repoName          Name of the repository
 * @return {Promise}
 */
function createPullRequest(token, branch, repoOwner, repoName) {
    const repo = repoName;
    const user = repoOwner;

    github.authenticate({
        type: 'oauth',
        token
    });

    return github.pullRequests.create({
        user,
        repo,
        title: '[DNM] testing',
        head: branch,
        base: 'master'
    });
}

/**
 * Get status of pull request
 * @method getStatus
 * @param  {String}   token         Github token
 * @param  {String}   branch        The branch to create the file in
 * @param  {String}   repoOwner     Owner of the repository
 * @param  {String}   repoName      Name of the repository
 * @param  {String}   sha           Git sha
 * @return {Promise}
 */
function getStatus(token, repoOwner, repoName, sha) {
    github.authenticate({
        type: 'oauth',
        token
    });

    return github.repos.getCombinedStatus({
        user: repoOwner,
        repo: repoName,
        sha
    });
}

module.exports = {
    cleanUpRepository,
    closePullRequest,
    createBranch,
    createFile,
    createPullRequest,
    getStatus
};

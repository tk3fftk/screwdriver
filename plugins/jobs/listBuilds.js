'use strict';

const boom = require('boom');
const joi = require('joi');
const schema = require('screwdriver-data-schema');
const listSchema = joi.array().items(schema.models.build.get).label('List of builds');

module.exports = () => ({
    method: 'GET',
    path: '/jobs/{id}/builds',
    config: {
        description: 'Get builds for a given job',
        notes: 'Returns builds for a given job',
        tags: ['api', 'jobs', 'builds'],
        auth: {
            strategies: ['token'],
            scope: ['user', 'pipeline']
        },
        plugins: {
            'hapi-swagger': {
                security: [{ token: [] }]
            }
        },
        handler: (request, reply) => {
            const factory = request.server.app.jobFactory;

            return factory.get(request.params.id)
                .then((job) => {
                    if (!job) {
                        throw boom.notFound('Job does not exist');
                    }

                    const config = {
                        sort: request.query.sort,
                        sortBy: 'createTime'
                    };

                    if (request.query.sortBy) {
                        config.sortBy = request.query.sortBy;
                    }

                    if (request.query.page || request.query.count) {
                        config.paginate = {
                            page: request.query.page,
                            count: request.query.count
                        };
                    }

                    return job.getBuilds(config);
                })
                .then(builds => reply(builds.map(b => b.toJson())))
                .catch(err => reply(boom.boomify(err)));
        },
        response: {
            schema: listSchema
        },
        validate: {
            query: schema.api.pagination
        }
    }
});

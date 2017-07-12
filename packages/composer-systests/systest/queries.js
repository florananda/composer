/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


'use strict';

const BusinessNetworkDefinition = require('composer-admin').BusinessNetworkDefinition;

const fs = require('fs');
const path = require('path');

const TestUtil = require('./testutil');
const chai = require('chai');
chai.should();
chai.use(require('chai-as-promised'));

describe('Query system tests', () => {

    let businessNetworkDefinition;
    let admin;
    let client;
    let assetsAsJSON;
    let participantsAsJSON;
    let assetsAsResources;
    let participantsAsResources;
    let serializer;

    /**
     * Generate the common part of the resource.
     * @param {Number} i The index.
     * @return {Object} The generated common part of the resource.
     */
    function generateCommon(i) {
        return {
            conceptValue: {
                $class: 'systest.queries.SampleConcept',
                stringValue: 'string ' + (i % 4),
                doubleValue: 2.5 * (i % 8),
                integerValue: 1000 * (i % 16),
                longValue: 100000 * (i % 32),
                dateTimeValue: new Date(100000 * (i % 16)).toISOString(),
                booleanValue: (i % 2) ? true : false,
                enumValue: 'VALUE_' + (i % 8)
            },
            stringValue: 'string ' + (i % 4),
            doubleValue: 2.5 * (i % 8),
            integerValue: 1000 * (i % 16),
            longValue: 100000 * (i % 32),
            dateTimeValue: new Date(100000 * (i % 16)).toISOString(),
            booleanValue: (i % 2) ? true : false,
            enumValue: 'VALUE_' + (i % 8)
        };
    }

    /**
     * Generate an asset.
     * @param {Number} i The index.
     * @return {Object} The generated asset.
     */
    function generateAsset(i) {
        let result = {
            $class: 'systest.queries.SampleAsset',
            assetId: 'ASSET_' + i,
            participant: 'resource:systest.queries.SampleParticipant#PARTICIPANT_' + (i % 4)
        };
        Object.assign(result, generateCommon(i));
        return result;
    }

    /**
     * Generate a participant.
     * @param {Number} i The index.
     * @return {Object} The generated participant.
     */
    function generateParticipant(i) {
        let result = {
            $class: 'systest.queries.SampleParticipant',
            participantId: 'ASSET_' + i,
            asset: 'resource:systest.queries.SampleAsset#ASSET_' + (i % 4)
        };
        Object.assign(result, generateCommon(i));
        return result;
    }

    before(function () {
        if (TestUtil.isHyperledgerFabricV06()) {
            return this.skip();
        }
        const modelFiles = [
            { fileName: 'models/queries.cto', contents: fs.readFileSync(path.resolve(__dirname, 'data/queries.cto'), 'utf8') }
        ];
        const queryFiles = [
            { identifier: 'queries.qry', contents: fs.readFileSync(path.resolve(__dirname, 'data/queries.qry'), 'utf8') }
        ];
        const scriptFiles = [];
        businessNetworkDefinition = new BusinessNetworkDefinition('systest-queries@0.0.1', 'The network for the query system tests');
        modelFiles.forEach((modelFile) => {
            businessNetworkDefinition.getModelManager().addModelFile(modelFile.contents, modelFile.fileName);
        });
        queryFiles.forEach((queryFile) => {
            let queryManager = businessNetworkDefinition.getQueryManager();
            queryManager.setQueryFile(queryManager.createQueryFile(queryFile.identifier, queryFile.contents));
        });
        scriptFiles.forEach((scriptFile) => {
            let scriptManager = businessNetworkDefinition.getScriptManager();
            scriptManager.addScript(scriptManager.createScript(scriptFile.identifier, 'JS', scriptFile.contents));
        });
        admin = TestUtil.getAdmin();
        return admin.deploy(businessNetworkDefinition)
            .then(() => {
                return TestUtil.getClient('systest-queries')
                    .then((result) => {
                        client = result;
                    });
            })
            .then(() => {
                serializer = client.getBusinessNetwork().getSerializer();
                assetsAsJSON = []; assetsAsResources = [];
                participantsAsJSON = []; participantsAsResources = [];
                for (let i = 0; i < 32; i++) {
                    const asset = generateAsset(i);
                    assetsAsJSON.push(asset);
                    assetsAsResources.push(serializer.fromJSON(asset));
                    const participant = generateParticipant(i);
                    participantsAsJSON.push(participant);
                    participantsAsResources.push(serializer.fromJSON(participant));
                }
                assetsAsJSON.sort(function (a, b) {
                    return a.assetId.localeCompare(b.assetId);
                });
                participantsAsJSON.sort(function (a, b) {
                    return a.participantId.localeCompare(b.participantId);
                });
            });
    });

    beforeEach(function () {
        if (TestUtil.isHyperledgerFabricV06()) {
            return this.skip();
        }
        return client.getAssetRegistry('systest.queries.SampleAsset')
            .then((assetRegistry) => {
                return assetRegistry.addAll(assetsAsResources);
            })
            .then(() => {
                return client.getParticipantRegistry('systest.queries.SampleParticipant');
            })
            .then((participantRegistry) => {
                return participantRegistry.addAll(participantsAsResources);
            });
    });

    ['assets', 'participants'].forEach((type) => {

        describe('#' + type, () => {

            let resource;
            let expected;

            beforeEach(() => {
                if (type === 'assets') {
                    expected = assetsAsJSON;
                    resource = 'systest.queries.SampleAsset';
                } else if (type === 'participants') {
                    expected = participantsAsJSON;
                    resource = 'systest.queries.SampleParticipant';
                } else {
                    throw new Error('unexpected type ' + type);
                }
            });

            it('should execute a named query on a string property', () => {
                return client.query(`${type}_stringValue`)
                    .then((resources) => {
                        const actual = resources.map((resource) => {
                            return serializer.toJSON(resource);
                        });
                        actual.should.deep.equal(expected.filter((thing) => {
                            return thing.stringValue === 'string 0';
                        }));
                    });
            });

            it('should execute a dynamic query on a string property', () => {
                const query = client.buildQuery(`SELECT ${resource} WHERE (stringValue == 'string 0')`);
                return client.query(query)
                    .then((resources) => {
                        const actual = resources.map((resource) => {
                            return serializer.toJSON(resource);
                        });
                        actual.should.deep.equal(expected.filter((thing) => {
                            return thing.stringValue === 'string 0';
                        }));
                    });
            });

            it('should execute a named query on a string property using a parameter', () => {
                return client.query(`${type}_stringValueParameter`, { inputStringValue: 'string 1' })
                    .then((resources) => {
                        const actual = resources.map((resource) => {
                            return serializer.toJSON(resource);
                        });
                        actual.should.deep.equal(expected.filter((thing) => {
                            return thing.stringValue === 'string 1';
                        }));
                    });
            });

            it('should execute a dynamic query on a string property using a parameter', () => {
                const query = client.buildQuery(`SELECT ${resource} WHERE (stringValue == _$inputStringValue)`);
                return client.query(query, { inputStringValue: 'string 1' })
                    .then((resources) => {
                        const actual = resources.map((resource) => {
                            return serializer.toJSON(resource);
                        });
                        actual.should.deep.equal(expected.filter((thing) => {
                            return thing.stringValue === 'string 1';
                        }));
                    });
            });

            it('should execute a named query on a nested string property', () => {
                return client.query(`${type}_nestedStringValue`)
                    .then((resources) => {
                        const actual = resources.map((resource) => {
                            return serializer.toJSON(resource);
                        });
                        actual.should.deep.equal(expected.filter((thing) => {
                            return thing.conceptValue.stringValue === 'string 0';
                        }));
                    });
            });

            it('should execute a dynamic query on a nested string property', () => {
                const query = client.buildQuery(`SELECT ${resource} WHERE (conceptValue.stringValue == 'string 0')`);
                return client.query(query)
                    .then((resources) => {
                        const actual = resources.map((resource) => {
                            return serializer.toJSON(resource);
                        });
                        actual.should.deep.equal(expected.filter((thing) => {
                            return thing.conceptValue.stringValue === 'string 0';
                        }));
                    });
            });

            it('should execute a named query on a nested string property using a parameter', () => {
                return client.query(`${type}_nestedStringValueParameter`, { inputStringValue: 'string 1' })
                    .then((resources) => {
                        const actual = resources.map((resource) => {
                            return serializer.toJSON(resource);
                        });
                        actual.should.deep.equal(expected.filter((thing) => {
                            return thing.conceptValue.stringValue === 'string 1';
                        }));
                    });
            });

            it('should execute a dynamic query on a nested string property using a parameter', () => {
                const query = client.buildQuery(`SELECT ${resource} WHERE (conceptValue.stringValue == _$inputStringValue)`);
                return client.query(query, { inputStringValue: 'string 1' })
                    .then((resources) => {
                        const actual = resources.map((resource) => {
                            return serializer.toJSON(resource);
                        });
                        actual.should.deep.equal(expected.filter((thing) => {
                            return thing.conceptValue.stringValue === 'string 1';
                        }));
                    });
            });

        });

    });

});
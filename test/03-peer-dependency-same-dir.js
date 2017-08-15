'use strict'
const expect = require('chai').expect,
    fs = require('fs-extra'),
    path = require('path'),
    testHelpers = require('./test-helpers')

describe('peer depedency same dir', function() {

    let tmpObj, sharedModulesPath, m1

    it('Create fake module structure', () => {
        tmpObj = testHelpers.makeTmpPath()
        sharedModulesPath = testHelpers.makeSharedModules(tmpObj.name)
        m1 = testHelpers.makeModule('m1', tmpObj.name)
        let m2 = testHelpers.addModuleToModule(m1, 'm2')
        let m3 = testHelpers.addModuleToModule(m2, 'm3')
        let m4 = testHelpers.addModuleToModule(m2, 'm4')
        testHelpers.removeDependency(m2, 'm4')
        testHelpers.addPeerDepenency(m2, 'm4')
        testHelpers.addDevDepenency(m2, 'm4') // should be irrelevant
    })

    it('can run npm flatten', () => {
        let result = testHelpers.runNpmFlattenCommand({
            sharedModulesPath: sharedModulesPath,
            modulePath: m1.fullPath
        })
    })

    it('has correct chared modules path', () => {
        let sharedModulesMade = fs.readdirSync(sharedModulesPath).sort()
        expect(sharedModulesMade).to.have.length(1)
        expect(sharedModulesMade).to.deep.equal([
          "m1@UNKNOWN,production,v6.3.0,files=324180bafd9f,deps=0998ecf8427e",
        //   "m2@UNKNOWN,production,v6.3.0,files=324180bafd9f,deps=3209647222dd",
        //   "m3@UNKNOWN,production,v6.3.0,files=324180bafd9f,deps=0998ecf8427e",
        //   "m4@UNKNOWN,production,v6.3.0,files=324180bafd9f,deps=0998ecf8427e"
        ])
    })

    it('has no node_modules directories within node_modules other than symlinks', () => {
        expect(testHelpers.listDirectoriesWithinAllNodeModules(tmpObj.name)).to.deep.equal([
            tmpObj.name + "/shared_modules/m1@UNKNOWN,production,v6.3.0,files=324180bafd9f,deps=0998ecf8427e/node_modules/m2",
            tmpObj.name + "/shared_modules/m1@UNKNOWN,production,v6.3.0,files=324180bafd9f,deps=0998ecf8427e/node_modules/m2/node_modules/m3",
            tmpObj.name + "/shared_modules/m1@UNKNOWN,production,v6.3.0,files=324180bafd9f,deps=0998ecf8427e/node_modules/m2/node_modules/m4"
        ])
    })

    it('has the right symlinks within node_modules', () => {
        expect(testHelpers.listSymlinksWithinAllNodeModules(tmpObj.name)
            .map(x => { return path.basename(x) }).sort())
            // .to.deep.equal(['m2', 'm3', 'm4'])
            .to.deep.equal([])
    })

    it('tidy up', function() {
        testHelpers.tidyUpTmpPath(tmpObj)
    })

})

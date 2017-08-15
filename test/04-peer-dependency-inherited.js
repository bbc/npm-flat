'use strict'
const expect = require('chai').expect,
    fs = require('fs-extra'),
    path = require('path'),
    testHelpers = require('./test-helpers')

describe('peer depedency inherited', function() {

    let tmpObj, sharedModulesPath, m1

    it('Create fake module structure', () => {
        tmpObj = testHelpers.makeTmpPath()
        sharedModulesPath = testHelpers.makeSharedModules(tmpObj.name)
        m1 = testHelpers.makeModule('m1', tmpObj.name)
        let m2 = testHelpers.addModuleToModule(m1, 'm2')
        let m3 = testHelpers.addModuleToModule(m1, 'm3')
        let m4 = testHelpers.addModuleToModule(m2, 'm4')
        testHelpers.addPeerDepenency(m4, 'm3')
        testHelpers.addDevDepenency(m4, 'm3') // should be irrelevant
    })

    it('can run npm flatten', () => {
        let result = testHelpers.runNpmFlattenCommand({
            sharedModulesPath: sharedModulesPath,
            modulePath: m1.fullPath
        })
    })

    let expectedM1Dir = "m1@UNKNOWN,production,v6.3.0,files=324180bafd9f,deps=b5ebe4558b8c"
    let expectedM2Dir = "m2@UNKNOWN,production,v6.3.0,files=324180bafd9f,deps=0998ecf8427e"
    let expectedM3Dir = "m3@UNKNOWN,production,v6.3.0,files=324180bafd9f,deps=0998ecf8427e"
    // let expectedM4Dir = "m4@UNKNOWN,production,v6.3.0,files=324180bafd9f,deps=0998ecf8427e"

    it('Create fake module structure', () => {
        let sharedModulesMade = fs.readdirSync(sharedModulesPath).sort()
        expect(sharedModulesMade).to.have.length(3)
        expect(sharedModulesMade).to.deep.equal([
            expectedM1Dir,
            expectedM2Dir,
            expectedM3Dir,
        //   expectedM4Dir
        ])
    })

    it('Check m4 has not been moved', () => {
        let m4NodeModulesFullDir = path.join(sharedModulesPath, expectedM2Dir, 'node_modules', 'm4')
        expect(fs.lstatSync(m4NodeModulesFullDir).isSymbolicLink()).to.be.false
        expect(fs.lstatSync(m4NodeModulesFullDir).isDirectory()).to.be.true
    })

    it('has the right symlinks within node_modules', () => {
        expect(testHelpers.listSymlinksWithinAllNodeModules(tmpObj.name)
            .map(x => { return path.basename(x) }).sort())
            // .to.deep.equal(['m2', 'm3', 'm3', 'm4'])
            .to.deep.equal(['m2', 'm3'])
    })

    it('tidy up', function() {
        testHelpers.tidyUpTmpPath(tmpObj)
    })

})

'use strict'
const expect = require('chai').expect,
    fs = require('fs-extra'),
    path = require('path'),
    testHelpers = require('./test-helpers')

describe('do not flatten if not in package.json', function() {

    let tmpObj, sharedModulesPath, m1

    it('Create fake module structure', () => {
        tmpObj = testHelpers.makeTmpPath()
        sharedModulesPath = testHelpers.makeSharedModules(tmpObj.name)
        m1 = testHelpers.makeModule('m1', tmpObj.name)
        let m2 = testHelpers.addModuleToModule(m1, 'm2')
        let m3 = testHelpers.addModuleToModule(m2, 'm3')
        let m4 = testHelpers.addModuleToModule(m2, 'm4')
        testHelpers.removeDependency(m2, 'm3')
    })

    it('can run npm flatten', () => {
        let result = testHelpers.runNpmFlattenCommand({
            sharedModulesPath: sharedModulesPath,
            modulePath: m1.fullPath
        })
    })

    let expectedM2Dir = "m2@UNKNOWN,production,v6.3.0,files=324180bafd9f,deps=899f54ca0a56"

    it('Check shared modules dir is correct', () => {
        let sharedModulesMade = fs.readdirSync(sharedModulesPath).sort()
        expect(sharedModulesMade).to.have.length(3)
        expect(sharedModulesMade).to.deep.equal([
            "m1@UNKNOWN,production,v6.3.0,files=324180bafd9f,deps=5bdddb24a598",
            expectedM2Dir,
            "m4@UNKNOWN,production,v6.3.0,files=324180bafd9f,deps=0998ecf8427e"
        ])
    })

    it('Check m2 node_modules dir is correct', () => {
        let m2NodeModulesFullDir = path.join(sharedModulesPath, expectedM2Dir, 'node_modules')
        let thingsInThere = fs.readdirSync(m2NodeModulesFullDir).sort()
        expect(thingsInThere).to.have.length(2)
        expect(thingsInThere).to.deep.equal(['m3', 'm4'])

        // m3 will not be flattened, so not a symlink:
        expect(fs.lstatSync(path.join(m2NodeModulesFullDir, 'm3')).isDirectory()).to.be.true
        expect(fs.lstatSync(path.join(m2NodeModulesFullDir, 'm4')).isDirectory()).to.be.false

        expect(fs.lstatSync(path.join(m2NodeModulesFullDir, 'm3')).isSymbolicLink()).to.be.false
        expect(fs.lstatSync(path.join(m2NodeModulesFullDir, 'm4')).isSymbolicLink()).to.be.true
    })

    it('tidy up', function() {
        testHelpers.tidyUpTmpPath(tmpObj)
    })

})

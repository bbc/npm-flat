'use strict'
const expect = require('chai').expect,
    fs = require('fs-extra'),
    path = require('path'),
    testHelpers = require('./test-helpers')

describe('basic flatten', function() {

    let tmpObj, sharedModulesPath, m1

    it('Create fake module structure', () => {
        tmpObj = testHelpers.makeTmpPath()
        sharedModulesPath = testHelpers.makeSharedModules(tmpObj.name)
        m1 = testHelpers.makeModule('m1', tmpObj.name)
        let m2 = testHelpers.addModuleToModule(m1, 'm2')
        let m3 = testHelpers.addModuleToModule(m2, 'm3')
    })

    it('can run npm flatten', () => {
        let result = testHelpers.runNpmFlattenCommand({
            sharedModulesPath: sharedModulesPath,
            modulePath: m1.fullPath
        })
    })

    it('has correct shared modules dir', () => {
        let sharedModulesMade = fs.readdirSync(sharedModulesPath).sort()
        expect(sharedModulesMade).to.have.length(3)
        expect(sharedModulesMade).to.deep.equal([
            "m1@UNKNOWN,production,v6.3.0,files=324180bafd9f,deps=12cf92c39d09",
            "m2@UNKNOWN,production,v6.3.0,files=324180bafd9f,deps=150fe932a2da",
            "m3@UNKNOWN,production,v6.3.0,files=324180bafd9f,deps=0998ecf8427e"
        ])
    })

    it('has no node_modules directories within node_modules other than symlinks', () => {
        expect(testHelpers.listDirectoriesWithinAllNodeModules(tmpObj.name)).to.deep.equal([])
    })

    it('has the right symlinks within node_modules', () => {
        expect(testHelpers.listSymlinksWithinAllNodeModules(tmpObj.name)
            .map(x => { return path.basename(x) }).sort())
            .to.deep.equal(['m2', 'm3'])
    })

    it('tidy up', function() {
        testHelpers.tidyUpTmpPath(tmpObj)
    })

})

const cmdArgs = require('command-line-args')
const fs = require('fs')
const YAML = require('yaml')
const parserEventNames = require("./parsers/event_names").parser;
const parserEventExpr = require("./parsers/event_expr").parser;
const parserSymbols = require("./parsers/symbols").parser;
const parserExpression = require("./parsers/expression").parser;
const planner = require('./planner/planner')
const secureAmqp = require('../cllibsecureamqp')
//const secureAmqp = require('secureamqp')

const cmdOptions = [
	{ name: 'send', alias: 's', type: String},
	{ name: 'config', alias: 'c', type: String},
	{ name: 'plan', alias: 'p', type: String}
]

const options = cmdArgs(cmdOptions)
options.config = options.config || "./config"
const config = require(options.config)
const toAddress = options.send


async function main() {
	await secureAmqp.init(config)
	const myAddress = secureAmqp.getMyAddress()
	console.log("Actor address: ", myAddress)

	secureAmqp.registerFunction('.f.handleResult', null, function(req, res) {
		console.log("Function handleResult called: ", JSON.stringify(req.msg))
	})

	planner.debug(true)
	planner.executePlan(options.plan)

}

main()

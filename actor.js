const cmdArgs = require('command-line-args')
const fs = require('fs')
const YAML = require('yaml')
//const parserEventNames = require("./parsers/event_names").parser;
//const parserEventExpr = require("./parsers/event_expr").parser;
//const parserSymbols = require("./parsers/symbols").parser;
//const parserExpression = require("./parsers/expression").parser;
//const planner = require('./planner/planner')

const cmdOptions = [
	{ name: 'config', alias: 'c', type: String},
	{ name: 'debug', type: Boolean}
]


const options = cmdArgs(cmdOptions)
options.config = options.config || "./config"
const config = require(options.config)

const Actor = (options.debug) ?  require('../cllibsecureamqp').Actor : require('secureamqp').Actor

const t = {
	"auditorA": "YAkJunLY0Pv3AjZHD++blx5PKOYydceseKmejkQqCGA=",
	"eventA": "Y6kVMKeW16Q8oNCGqlfCr12w5jaIzaJeoC+vfZIvb24=",
	"bucketA": "GMpLkzapjAZTy/ggQju8PE4UjvmZmD30ZwICPB706d0=",
	"bucketB": "tYsxMWCUQxpgfz+uVZk/WBC+/clQQevcrckBohUK14U=",
	"codeRed": "Y6kVMKeW16Q8oNCGqlfCr12w5jaIzaJeoC+vfZIvb24=.codeRed",
	"codeOrange": "Y6kVMKeW16Q8oNCGqlfCr12w5jaIzaJeoC+vfZIvb24=.codeOrange",
	"codeYellow": "Y6kVMKeW16Q8oNCGqlfCr12w5jaIzaJeoC+vfZIvb24=.codeYellow"
}

async function main() {
		const planner = new Actor(config)
		await planner.boot()
		const plannerAddress = planner.id()
		console.log("Actor address: ", plannerAddress)

		// listen to events from other actors and react to them
	    planner.listen("codeRed", function(event) {
			console.log("Received event: ", event)
			// create an operation definition for the auditor to sign
			const op  = planner.createOperationRequestDefinition(t.bucketA, 'copy', 'function', {})
			// ask auditor actor to sign the operation definition
			const token = await planner.actor(t.auditorA).sign(op)
			console.log("Received token: ", token)
			// use token from auditor as an authorization call 'send' function on bucketA actor
			const res = await planner.actor(t.bucketA).call('send', token, { some: 'thing'})
			console.log(res)
		})

}

main()

const cmdArgs = require('command-line-args')
const fs = require('fs')
const YAML = require('yaml')
const parserEventNames = require("./parsers/event_names").parser;
const parserEventExpr = require("./parsers/event_expr").parser;
const parserSymbols = require("./parsers/symbols").parser;
const parserExpression = require("./parsers/expression").parser;
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
const events = {}

const _plan = (() => {
	if(options.plan) {
		const file = fs.readFileSync(options.plan, 'utf8')
		const p = YAML.parse(file)
		return p
	} else return {}
})()


function replace(s, t) {
	function tr(k) {
		if(t[k]) {
			return t[k]
		} else {
			return k
		}
	}
	console.log("Replacing: ", s)
	if(s.indexOf('{{') == -1) {
		return s
	}
	const subSub = parserSymbols.parse(s)
	console.log(subSub)
	const x = eval(subSub)
	return x
}

function replaceExpr(s, t) {
	console.log("Start replace of: ", s)
	const dict = {}
	const eventCsv = parserEventNames
		.parse(s)
		.split(',')
		.forEach(e => {
			const x = replace(e,t)
			dict[e] = x
		})

	let subStr = s
	Object.keys(dict).forEach(k => {
		subStr = subStr.replace(k, dict[k])
	})
	return subStr
}

function extract(s) {
		const re = new RegExp('{{(.*?)}}')
		const r = s.match(re)
		if(r) {
			return r[1]
		} else {
			return s
		}
}


/*function _replace_(s, t) {
	console.log("Starting replace: ", s)
	const subStr = dig(s, t)
	console.log("Replace " + s + " with " + subStr)
	return subStr

	function dig(s, t){
		const re = new RegExp('{{(.*?)}}')
		const r = s.match(re)
		if(r) {
			if(t[r[1]]){
				let ns = s.replace(r[0], t[r[1]])
				return dig(ns, t)
			} else {
				let ns = s.replace(r[0], "None")
				return dig(ns, t)
			}
		} else {
			return s
		}
	}
}*/

function parsePlan(p) {
	const table = p.table
	const events = {}
	const actions = {}
	const listeners = {}
	const triggers = {}

	table['me'] = secureAmqp.getMyAddress()

	p.actions.forEach(a => {
		a.fired = false
		a.firedAt = null
		actions[a.name] = a
		const expandedExpr = replaceExpr(a.on, table)
		console.log("Expanded expr: ", expandedExpr)
		const eventExpr = parserEventExpr.parse(expandedExpr)
		const eventCsv = parserEventNames
			.parse(expandedExpr)
			.split(',')
			.forEach(ee => {
				e = ee.substr(2, ee.lenght)
				events[e] = e
				triggers[e] = {
					type: null,
					value: null
				}
				listeners[e] = {
					name: a.name,
					expr: eventExpr
				}
			})
	})
	return {
		events: events,
		actions: actions,
		listeners: listeners,
		table: table,
		triggers: triggers
	}
}

let plan

function addToTable(k, v, t) {
	console.log("Adding to table: ", { key: k, value: v})
	t[k] = v
}

function newEvent(event) {
	console.log("New event: ", event)
	addToTable(event.name + ".value", event.value, plan.table) 

	function evaluate(expr) {
		console.log("Evaluating expr: ", expr)
		const e = plan.triggers
		let ev = false
		eval("ev = (" + expr + ") ? true : false")
		return ev
	}

	function typedEvent(ev) {
		if(ev.type == "boolean")
			return (ev.value === "true")
		if(ev.type == "number")
			return Number(ev.value)
		return ev.value
	}

	const l = plan.listeners[event.name]
	plan.triggers[event.name] = {
		value: typedEvent(event),
		type: event.type
	}

	if(l) {
		const action = plan.actions[l.name]
		console.log("Fired event: ", event.name)
		if(!action.startWindow) {
			action.startWindow = new Date().getTime()
			if(!action.timeWindow) {
				action.timeWindow = 60
			}
		}

		if(evaluate(l.expr)) {
			console.log(action.on + " evaluates to true.")
			const t1 = new Date().getTime()
			const tDiff = t1 - action.startWindow
			if(tDiff > (action.timeWindow * 1000)) {
				console.log("Time window expired for event.")
				action.startWindow = null
				return
			}
			if(!action.fired) {
				action.fired = true
				action.firedAt = new Date().toISOString()
				setTimeout(() => {
					// reset fired action
					action.fired = false
					action.startWindow = null
				}, action.resetAfter * 1000)
				// run actions
				runAction(action)
			}
		}
	}
}

function runAction(action) {
	console.log("Running action: ", action)
	function tr(k) {
		const t = plan.table
		if(t[k]) {
			return t[k]
		} else {
			return k
		}
	}
	action.do.forEach(t => {
		if(t.expr) {
			// process expression
			console.log("EXPR: ", t.expr)
			const lhs = extract(t.expr.split('=')[0])
			const rhs = t.expr.split('=')[1]
			const x = eval(parserExpression.parse(rhs))
			addToTable(lhs, x, plan.table)
			return
		}
		if(t.print) {
			const p = replace(t.print, plan.table)
			console.log("[PRINT " + t.print +"] " + p)
			return
		}
		const f = replace(t.function, plan.table).split('.')
		const d = f[0]
		const fname = '.' + f[1] +'.' + f[2]
		t.newParams = {}
		Object.keys(t.params).forEach(k => {
			let v = t.params[k]
			console.log("VV: ", v)
			t.newParams[k] = replace(v, plan.table)
			//t.params[k] = v
			console.log("Param: " + k + " = " + v)
		})
		console.log("Calling function: " + d + fname)
		secureAmqp.callFunction(d, fname, t.newParams, null, function(res) {
			console.log("Fucntion: " + fname + " returned.")
			const result = res.msg
			addToTable(t.return.ref, result.response, plan.table)
			t.return['200'].forEach(ret => {

				const eventName = replace(ret.eventName, plan.table)
				const eventType = ret.eventType || "String"
				const eventValue = replace(ret.eventValue, plan.table)
				console.log("Emit: ", eventName)	
				secureAmqp.emitEvent(eventName, eventType, eventValue, null)
			})
		})
	})
}

function debug() {
	console.log("Debug.......");
	newEvent({
		name: "Y6kVMKeW16Q8oNCGqlfCr12w5jaIzaJeoC+vfZIvb24=.e.codeRed",
		value: true,
		type: "boolean"
	})
}

async function main() {
	await secureAmqp.init(config)
	const myAddress = secureAmqp.getMyAddress()
	console.log("Actor address: ", myAddress)
	plan = parsePlan(_plan)

//	debug()

	secureAmqp.registerFunction('.f.handleResult', null, function(req, res) {
		console.log("Function handleResult called: ", JSON.stringify(req.msg))
	})

	Object.keys(plan.events).forEach(k => {
		console.log("Subscribing to event: ", k)
		secureAmqp.subscribeEvent(k, function(e) {
			newEvent(e)
		})
	})
}

main()

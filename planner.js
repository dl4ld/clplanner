const cmdArgs = require('command-line-args')
const fs = require('fs')
const YAML = require('yaml')
const parserEventNames = require("./parsers/event_names").parser;
const parserEventExpr = require("./parsers/event_expr").parser;
//const secureAmqp = require('../cllibsecureamqp')
const secureAmqp = require('secureamqp')

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
		const re = new RegExp('{{(.*?)}}')
		const r = s.match(re)
		if(r) {
			if(t[r[1]]){
				let ns = s.replace(r[0], t[r[1]])
				return replace(ns, t)
			} else {
				let ns = s.replace(r[0], "None")
				return replace(ns, t)
			}
		} else {
			return s
		}
}

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
		const expandedExpr = replace(a.on, table)
		const eventExpr = parserEventExpr.parse(expandedExpr)
		const eventCsv = parserEventNames
			.parse(expandedExpr)
			.split(',')
			.forEach(e => {
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

function newEvent(event) {
	/*function f(e) {
		if(typeof e === "boolean") {
			return e
		}
		if(plan.triggers[e]) {
			return true
		} else {
			return false
		}
	}*/
	

	function evaluate(expr) {
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


	console.log("Received event: ", event)
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

	//	let ev
	//	eval("ev = (" + l.expr + ") ? true : false")
	//	console.log("EV: ", ev)
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
	action.do.forEach(t => {
		const f = replace(t.function, plan.table).split('.')
		const d = f[0]
		const fname = '.' + f[1] +'.' + f[2]
		Object.keys(t.params).forEach(k => {
			let v = t.params[k]
			v = replace(v, plan.table)
			t.params[k] = v
		})
		console.log("Calling function: " + d + fname)
		secureAmqp.callFunction(d, fname, t.params, null, function(res) {
			console.log("Fucntion: " + fname + " returned.")
			const result = res.msg
			plan.table[t.returnId] = result
			// do stuff
			// emit event that function is ready
			const successEvent = replace(t.successEvent, plan.table)
			secureAmqp.emitEvent(successEvent, "boolean", "true", null)
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

	//debug()

	secureAmqp.registerFunction('.f.handleResult', null, function(req, res) {
		console.log("Function handleResult called: ", req.msg)
	})

	Object.keys(plan.events).forEach(k => {
		console.log("Subscribing to event: ", k)
		secureAmqp.subscribeEvent(k, function(e) {
			newEvent(e)
		})
	})
}

main()

const YAML = require('yaml')
const fs = require('fs')
const parserEventNames = require("../parsers/event_names").parser;
const parserEventExpr = require("../parsers/event_expr").parser;
const parserSymbols = require("../parsers/symbols").parser;
const parserExpression = require("../parsers/expression").parser;
const secureAmqp = require('../../cllibsecureamqp')
//const secureAmqp = require('secureamqp')

const events = {}
let plan

function replace(s, t) {
	function tr(k) {
		if(t[k] !== undefined) {
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
		if(a.on == "_") {
			return
		}
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
				if(!listeners[e]) {
					listeners[e] = []
				}
				listeners[e].push ({
					name: a.name,
					expr: eventExpr
				})
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

	plan.triggers[event.name] = {
		value: typedEvent(event),
		type: event.type
	}
	
	const listeners = plan.listeners[event.name] || []
	listeners.forEach(l => {
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
		} else {
			// console.log(plan.triggers)
		}
	})
}



function runAction(action) {
	console.log("Running action: ", action)
	function tr(k) {
		const t = plan.table
		if(t[k] !== undefined) {
			return t[k]
		} else {
			return k
		}
	}
	action.do.forEach(t => {
		// if action is an expression e.g. C = A + B
		// evaulate expression and save it in symbol table
		if(t.expr) {
			const lhs = extract(t.expr.split('=')[0])
			const rhs = t.expr.split('=')[1]
			const x = eval(parserExpression.parse(rhs))
			addToTable(lhs, x, plan.table)
			return
		}
		// if action is print; print the variable from the symbol table
		if(t.print) {
			const p = replace(t.print, plan.table)
			console.log("[PRINT " + t.print +"] " + p)
			return
		}
		// if action is to fire a new event
		if(t.event) {
			const e = t.event
			const eventName = replace(e.eventName, plan.table)
			const eventType = e.eventType || "String"
			//const eventValue = replace(ret.eventValue, plan.table)
			const eventValue = eval(parserExpression.parse(e.eventValue))
			console.log("Emit: " + eventName + " Value: " + eventValue)	
			secureAmqp.emitEvent(eventName, eventType, eventValue, null)
			return
		}
		// if action is a function; call function over message queue
		const f = replace(t.function, plan.table).split('.')
		const d = f[0]
		const fname = '.' + f[1] +'.' + f[2]
		// translate parameter variables and store in new object so
		// that parameters can be transalted on subsequent calls
		t.newParams = {}
		Object.keys(t.params).forEach(k => {
			let v = t.params[k]
			t.newParams[k] = replace(v, plan.table)
		})
		// call the function using the message queue 
		// and register a callback on function return
		console.log("Calling function: " + d + fname)
		secureAmqp.callFunction(d, fname, t.newParams, null, function(res) {
			console.log("Fucntion: " + fname + " returned.")
			if(!t.return) {
				return
			}
			
			const result = res.msg
			// add result as reference in symbol table
			addToTable(t.return.ref, result.response, plan.table)
			// handle response codes; trigger events
			const codes = t.return.codes
			if(!codes) {
				return
			}
			const resultCode = parseInt(result.status)
			const code = codes[resultCode] || []
			code.forEach(ret => {
				const eventName = replace(ret.eventName, plan.table)
				const eventType = ret.eventType || "String"
				//const eventValue = replace(ret.eventValue, plan.table)
				const eventValue = eval(parserExpression.parse(ret.eventValue))
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

module.exports.executePlan = function(fileName) {
	const fileContents = fs.readFileSync(fileName, 'utf8')
	const p = YAML.parse(fileContents)
	plan = parsePlan(p)
	Object.keys(plan.events).forEach(k => {
		console.log("Lib Subscribing to event: ", k)
		secureAmqp.subscribeEvent(k, function(e) {
			newEvent(e)
		})
	})
	if(plan.actions.start) {
		runAction(plan.actions.start)
	}
}

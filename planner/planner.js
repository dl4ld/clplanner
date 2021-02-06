const YAML = require('yaml')
const fs = require('fs')
const axios = require('axios')
const Promise = require('bluebird')
const parserEventNames = require("../parsers/event_names").parser;
const parserEventExpr = require("../parsers/event_expr").parser;
const parserSymbols = require("../parsers/symbols").parser;
const parserExpression = require("../parsers/expression").parser;
const secureAmqp = require('../../cllibsecureamqp')
//const secureAmqp = require('secureamqp')

const events = {}
let plan
let DEBUG = false

function log(m, v){
	if(!DEBUG) return

	console.log(m,v)
}

function print(n, p) {
	console.log("[PRINT " + n +"] " + p)
}

function replace(s, t) {
	function tr(k) {
		if(t[k] !== undefined) {
			return t[k]
		} else {
			return k
		}
	}
	log("Replacing: ", s)
	if(s.indexOf('{{') == -1) {
		return s
	}
	const subSub = parserSymbols.parse(s)
	const x = eval(subSub)
	return x
}

function replaceExpr(s, t) {
	log("Start replace of: ", s)
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
		log("Expanded expr: ", expandedExpr)
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
	log("Adding to table: ", { key: k, value: v})
	t[k] = v
}

function newEvent(event) {
	log("New event: ", event)
	addToTable(event.name + ".value", event.value, plan.table) 

	function evaluate(expr) {
		log("Evaluating expr: ", expr)
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
		log("Fired event: ", event.name)
		if(!action.startWindow) {
			action.startWindow = new Date().getTime()
			if(!action.timeWindow) {
				action.timeWindow = 60
			}
		}

		if(evaluate(l.expr)) {
			log(action.on + " evaluates to true.")
			const t1 = new Date().getTime()
			const tDiff = t1 - action.startWindow
			if(tDiff > (action.timeWindow * 1000)) {
				log("Time window expired for event.")
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
			// log(plan.triggers)
		}
	})
}


function tr(k) {
	const t = plan.table
	if(t[k] !== undefined) {
		return t[k]
	} else {
		return k
	}
}

function runAction(action) {
	log("Running action: ", action)
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
			print(t.print, p)
			return
		}
		// if action is http; make an external http call
		if(t.http) {
			const h = t.http
			const x = axios({
				url: h.url,
				method: h.method,
				headers: h.headers,
				data:h.data
			})
			Promise.bind(x, t)
			x.then(response => {
				addToTable(t.http.return.ref, response.data, plan.table)
				// handle response codes; trigger events
				const codes = t.http.return.codes
				if(!codes) {
					return
				}
				const resultCode = parseInt(response.status)
				const code = codes[resultCode] || []
				code.forEach(ret => {
					emitEvent(ret, plan.table)
				})
			})
			
			return
		}
		// if action is to fire a new event
		if(t.event) {
			emitEvent(t.event, plan.table)
			/*const e = t.event
			const eventName = replace(e.eventName, plan.table)
			const eventType = e.eventType || "String"
			//const eventValue = replace(ret.eventValue, plan.table)
			const eventValue = eval(parserExpression.parse(e.eventValue))
			log("Emit: " + eventName + " Value: " + eventValue)	
			secureAmqp.emitEvent(eventName, eventType, eventValue, null)*/
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
		log("Calling function: " + d + fname)
		secureAmqp.callFunction(d, fname, t.newParams, null, function(res) {
			log("Fucntion: " + fname + " returned.")
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
				emitEvent(ret, plan.table)
				/*const eventName = replace(ret.eventName, plan.table)
				const eventType = ret.eventType || "String"
				//const eventValue = replace(ret.eventValue, plan.table)
				const eventValue = eval(parserExpression.parse(ret.eventValue))
				log("Emit: ", eventName)	
				secureAmqp.emitEvent(eventName, eventType, eventValue, null)*/
			})
		})
	})
}

function emitEvent(e, t) {
	const eventName = replace(e.eventName, t)
	const eventType = e.eventType || "String"
	const eventValue = eval(parserExpression.parse(e.eventValue))
	log("Emit: ", eventName)	
	secureAmqp.emitEvent(eventName, eventType, eventValue, null)
}

function debug() {
	log("Debug.......");
	newEvent({
		name: "Y6kVMKeW16Q8oNCGqlfCr12w5jaIzaJeoC+vfZIvb24=.e.codeRed",
		value: true,
		type: "boolean"
	})
}

module.exports.debug = function(s) {
	DEBUG = s
}

module.exports.executePlan = function(fileName) {
	const fileContents = fs.readFileSync(fileName, 'utf8')
	const p = YAML.parse(fileContents)
	plan = parsePlan(p)
	Object.keys(plan.events).forEach(async k => {
		log("Lib Subscribing to event: ", k)
		await secureAmqp.subscribeEvent(k, function(e) {
			newEvent(e)
		})
	})
	setTimeout(() => {
		if(plan.actions.start) {
			runAction(plan.actions.start)
		}
	}, 1000)
}

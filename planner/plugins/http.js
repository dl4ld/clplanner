const axios = require('axios')
const name = 'http'

function handler(req, res) {
	const h = req.http
	const x = axios({
		url: h.url,
		method: h.method,
		headers: h.headers,
		data:h.data
	}).then(response => {
		if((response.status >= 200) && (response.status < 300) ) {
			res.status(200).send(response.data)
		} else {
			res.status(400).send(response.data)
		}
	})
}

module.exports = function(moduleHandler) {
	moduleHandler[name] = handler
	console.log("Loaded plugin: ", name)
}

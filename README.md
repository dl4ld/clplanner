# Secure Actors

## Quick start
copy template_config.json to config.json and fill the rabbitmq url, user and pass. 

build docker image

```
make build
```

run bob
```
make run
node bob.js
```

run alice (copy the address from bob)
```
make run
node alice.js -s BOB_ADDRESS
```

you should see hello world and hello mars messages.


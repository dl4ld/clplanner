# Secure Actors

## Quick start
copy template_config.json to config.json and fill the rabbitmq url, user and pass. 
If keys are not provided a new pair is generated everytime the planner runs.
Put config file and plan file in a seperate directory.

build docker image

```
make build
```

run planner
```
make run config=CONFIG_FOLDER
node planner.js -c /mnt/config.planner.json -p /mnt/plan.yaml
```


.PHONY: all


CONFIG = $(shell cat config.json | base64 | tr -d '\n')

test:
	echo ${CONFIG}

build:
	docker build -t dl4ld/clactor .

run: build
	docker run -it -e CONFIG=${CONFIG} dl4ld/clactor /bin/sh

push: build
	docker push dl4ld/clactor:latest


.PHONY: all
CONFIGPATH = $(shell realpath ../configs)

build:
	docker build -t dl4ld/clplanner .

run: build
	docker run -it -v ${CONFIGPATH}:/mnt dl4ld/clplanner /bin/sh

push: build
	docker push dl4ld/clplanner:latest


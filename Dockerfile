FROM mhart/alpine-node:8
RUN apk add git
RUN mkdir /app
ADD *.js /app/
ADD package.json /app/
ADD template_config.json /app/
WORKDIR /app
RUN npm install
ENTRYPOINT echo $CONFIG | base64 -d > /app/config.json && /bin/sh

# Copyright (c) 2018, Livio, Inc.
FROM node:8

WORKDIR /app

ADD . /app

RUN npm install

RUN npm run build-webpage

EXPOSE 4000

CMD ["npm", "start"]

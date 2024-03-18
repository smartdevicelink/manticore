# Copyright (c) 2018, Livio, Inc.
FROM node:20

WORKDIR /app

ADD . /app

RUN npm install

EXPOSE 4000

CMD ["npm", "start"]

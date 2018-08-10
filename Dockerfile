FROM node:8

WORKDIR /app

ADD . /app

RUN npm install

EXPOSE 4000

CMD ["npm", "start"]

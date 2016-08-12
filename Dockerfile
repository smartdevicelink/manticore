FROM node:6.3.1

MAINTAINER Christopher Rokita version:1.0

ENV EH eh

# Create app directory and go to it
RUN mkdir -p /usr/app/server/
WORKDIR /usr/app/

# Bundle app source code
COPY server server

# Install dependencies
WORKDIR /usr/app/server
RUN npm install

EXPOSE 4000

# Start the node server
CMD ["npm", "start"]
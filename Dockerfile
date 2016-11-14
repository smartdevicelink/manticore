FROM node:6.3.1

MAINTAINER Christopher Rokita version:1.0

# Create app directory and go to it
RUN mkdir -p /usr/app/server
RUN mkdir -p /usr/app/client
WORKDIR /usr/app

# Bundle app source code
COPY server server
COPY client client

# Install dependencies
WORKDIR /usr/app/server
RUN npm install

EXPOSE 4000

# Start the node server
CMD ["npm", "start"]
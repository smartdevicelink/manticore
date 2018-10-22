## Overview

Manticore is a distributed system that sets up resources for clients over the web automatically for ease of use. This page describes the implementation of Manticore that is hosted on the [Developer Portal](https://smartdevicelink.com/resources/manticore/). An account is required to use the hosted service.

Manticore does the following:

   * Handles the setup of [SDL Core](https://github.com/smartdevicelink/sdl_core) and [Generic HMI](https://github.com/smartdevicelink/generic_hmi) and has them communicate with each other
   * Works with the [Developer Portal's Manticore UI](https://smartdevicelink.com/resources/manticore/) to connect the user to their resources with supplied connection information. Open the link for instructions on how to use the service
   * Keeps users in a waiting list if there is not enough space or memory to create more resources
   * Informs idling users about their resources shutting down, at which point they can respond to continue using them for longer

If you're interested in downloading and setting up the project yourself, then visit the [Github Wiki](https://github.com/smartdevicelink/manticore/wiki) for more information.

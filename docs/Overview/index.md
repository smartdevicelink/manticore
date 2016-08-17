## Overview

Manticore is a system that sets up SDL core and HMI programs automatically for ease of use.

Manticore uses Docker, Nomad and Consul in order to schedule and link containers of SDL components.

The documentation here describes Manticore that is hosted by Livio and covers the API calls necessary in order to use it.

Manticore does the following:
  * Set up SDL core and the HMI, and have them communicate automatically
  * Allow any branch of sdl_core and any branch of sdl_hmi to be used, along with branches of other HMIs recognized
  * Handle where core and HMI are installed among a network of machines allocated to Manticore
  * Continue working when machines fail, thanks to Manticore's distributed architecture
  * Directs the user to their core and HMI setup, giving information on how to connect their app to it.

Check out the [API Documentation](../API) for more information
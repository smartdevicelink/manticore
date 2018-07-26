# A sample settings file for generating haproxy.cfg files
# sudo consul-template -config template-settings.hcl &

consul {
    address= "$LOCAL_IP:8500"
}

template {
    source = "haproxy.tmpl"
    destination = "/etc/haproxy/haproxy.cfg"
    command = "/bin/bash -c 'sudo service haproxy reload || true'"
    wait = "2s:4s"
}

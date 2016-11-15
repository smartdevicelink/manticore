#command that mimics the behavior of the init.d reload command for haproxy
exec=$HAPROXY_EXEC
config=$HAPROXY_CONFIG
pid=$HAPROXY_PID

echo $exec
echo $config
echo $pid

$exec -c -q -f $config
if [$? -ne 0]; then
	echo "Errors in configuration file, check with haproxy check"
	return 1
echo -n $"Reloading haproxy: "
$exec -D -f $config -p $pid -sf $(cat $pid)
retval = $?
echo
return $retval
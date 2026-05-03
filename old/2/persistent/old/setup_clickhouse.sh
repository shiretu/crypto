#!/bin/sh

set -e

root_dir=$(dirname $(realpath "$0"))
ch_dir="/Users/shiretu/work/crypto_data"

mkdir -p "${ch_dir}"/{bin,data,logs,tmp,config}

if [ ! -f "${ch_dir}/bin/clickhouse" ]; then
    echo "Downloading ClickHouse binary..."
    curl "https://builds.clickhouse.com/master/macos/clickhouse" -o "${ch_dir}"/bin/clickhouse
    chmod +x "${ch_dir}"/bin/clickhouse
fi

if [ ! -f "${ch_dir}"/config/config.xml ]; then
    echo "Creating ClickHouse configuration..."
    cat >"${ch_dir}"/config/config.xml <<EOF
<clickhouse>
    <logger>
        <level>information</level>
        <log>${ch_dir}/logs/clickhouse.log</log>
        <errorlog>${ch_dir}/logs/clickhouse.err.log</errorlog>
    </logger>

    <path>${ch_dir}/data/</path>
    <tmp_path>${ch_dir}/tmp/</tmp_path>
    <user_files_path>${ch_dir}/data/user_files/</user_files_path>

    <listen_host>127.0.0.1</listen_host>
    <http_port>8123</http_port>
    <tcp_port>9000</tcp_port>

    <!-- limits -->
    <max_table_size_to_drop>0</max_table_size_to_drop>
    <max_partition_size_to_drop>0</max_partition_size_to_drop>

    <!-- minimal profiles/quotas to satisfy the references in <users> -->
    <profiles>
        <default>
            <!-- keep it empty/minimal; you can tune later -->
            <!-- e.g., <max_memory_usage>0</max_memory_usage> for unlimited -->
        </default>
    </profiles>

    <quotas>
        <default>
            <interval>
                <duration>3600</duration>
                <queries>0</queries>
                <errors>0</errors>
                <result_rows>0</result_rows>
                <read_rows>0</read_rows>
                <execution_time>0</execution_time>
            </interval>
        </default>
    </quotas>

    <users>
        <default>
            <password></password>
            <networks>
                <ip>127.0.0.1</ip>
            </networks>
            <profile>default</profile>
            <quota>default</quota>
        </default>
    </users>
</clickhouse>
EOF
fi

if [ ! -f "${ch_dir}"/bin/ch_stop ]; then
    echo "Creating ClickHouse stop script..."
    cat >"${ch_dir}"/bin/ch_stop <<EOF
#!/bin/sh
set -e
kill "\$(cat ${ch_dir}/data/status| grep PID | cut -d ":" -f2)"
EOF
    chmod +x "${ch_dir}"/bin/ch_stop
fi

if [ ! -f "${ch_dir}"/bin/ch_start ]; then
    echo "Creating ClickHouse startup script..."
    cat >"${ch_dir}"/bin/ch_start <<EOF
#!/bin/sh
set -e
"${ch_dir}"/bin/ch_stop || true
"${ch_dir}"/bin/clickhouse server --config-file="${ch_dir}"/config/config.xml --daemon
EOF
    chmod +x "${ch_dir}"/bin/ch_start
fi

if [ ! -f "${ch_dir}"/bin/ch_cl ]; then
    echo "Creating ClickHouse client script..."
    cat >"${ch_dir}"/bin/ch_cl <<EOF
#!/bin/sh
set -e
"${ch_dir}"/bin/clickhouse client --host 127.0.0.1 --port 9000 "\$@"
EOF
    chmod +x "${ch_dir}"/bin/ch_cl
fi

echo "Starting ClickHouse server..."
"${ch_dir}"/bin/ch_start

pub(super) const NO_INSTALL_COLLECTOR_SCRIPT: &str = r#"LC_ALL=C
export LC_ALL

emit_section() {
  name="$1"
  status="$2"
  body="$3"
  printf '__GPUWATCH_SECTION__:%s:%s\n' "$name" "$status"
  if [ -n "$body" ]; then
    printf '%s\n' "$body"
  fi
  printf '__GPUWATCH_END__:%s\n' "$name"
}

run_capture() {
  output="$($@ 2>&1)"
  status=$?
}

run_capture hostname
emit_section hostname "$status" "$output"

if ! command -v nvidia-smi >/dev/null 2>&1; then
  emit_section gpu_csv 127 'nvidia-smi not found'
  emit_section compute_apps_csv 127 'nvidia-smi not found'
  emit_section gpu_extra_csv 127 'nvidia-smi not found'
  emit_section mig_list 127 'nvidia-smi not found'
  emit_section pmon 127 'nvidia-smi not found'
  emit_section dmon 127 'nvidia-smi not found'
  emit_section dmon_pcie 127 'nvidia-smi not found'
  emit_section ps 0 ''
  exit 0
fi

run_capture nvidia-smi --query-gpu=index,uuid,pci.bus_id,name,driver_version,memory.total,memory.used,memory.free,utilization.gpu,utilization.memory,temperature.gpu,power.draw,power.limit,fan.speed,clocks.current.graphics,clocks.current.memory --format=csv,noheader,nounits
gpu_csv_output="$output"
emit_section gpu_csv "$status" "$gpu_csv_output"

run_capture nvidia-smi --query-compute-apps=gpu_uuid,pid,process_name,used_gpu_memory --format=csv,noheader,nounits
compute_apps_output="$output"
compute_apps_status="$status"
emit_section compute_apps_csv "$compute_apps_status" "$compute_apps_output"

run_capture nvidia-smi --query-gpu=index,uuid,mig.mode.current,mig.mode.pending,pcie.link.gen.current,pcie.link.width.current --format=csv,noheader,nounits
emit_section gpu_extra_csv "$status" "$output"

run_capture nvidia-smi -L
emit_section mig_list "$status" "$output"

run_capture nvidia-smi pmon -s um -c 1
pmon_output="$output"
pmon_status="$status"
emit_section pmon "$pmon_status" "$pmon_output"

run_capture nvidia-smi dmon -s pucm -c 1 --format=csv,noheader,nounit
emit_section dmon "$status" "$output"

run_capture nvidia-smi dmon -s t -c 1 --format=csv,noheader,nounit
emit_section dmon_pcie "$status" "$output"

pids=$(
  {
    if [ "$compute_apps_status" -eq 0 ]; then
      printf '%s\n' "$compute_apps_output" | awk -F, '{ gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2); if ($2 ~ /^[0-9]+$/) print $2 }'
    fi
    if [ "$pmon_status" -eq 0 ]; then
      printf '%s\n' "$pmon_output" | awk '!/^#/ && $2 ~ /^[0-9]+$/ { print $2 }'
    fi
  } | sort -n | uniq | paste -sd, -
)

case "$pids" in
  *[!0-9,]*|'')
    emit_section ps 0 ''
    ;;
  *)
    output=$(ps -p "$pids" -o pid= -o ppid= -o user= -o comm= -o pcpu= -o pmem= -o etimes= -o etime= -o args= 2>&1 | awk '{ args=""; for (i = 9; i <= NF; i++) { args = args (i == 9 ? "" : " ") $i } print $1 "|" $2 "|" $3 "|" $4 "|" args "|" $5 "|" $6 "|" $7 "|" $8 }')
    status=$?
    if [ "$status" -ne 0 ]; then
      output=$(ps -p "$pids" -o pid= -o ppid= -o user= -o comm= -o pcpu= -o pmem= -o etime= -o args= 2>&1 | awk '{ args=""; for (i = 8; i <= NF; i++) { args = args (i == 8 ? "" : " ") $i } print $1 "|" $2 "|" $3 "|" $4 "|" args "|" $5 "|" $6 "|" $7 }')
      status=$?
    fi
    emit_section ps "$status" "$output"
    ;;
esac
"#;

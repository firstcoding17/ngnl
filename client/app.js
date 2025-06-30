const { createApp, ref } = Vue

createApp({
  setup() {
    const columns = ref([])
    const dataRows = ref([])
    const showPopup = ref(false)
    const selectedStats = ref([])
    const selectedColumns = ref([])
    const results = ref({})

    const statOptions = [
      { label: '평균', value: 'mean' },
      { label: '중앙값', value: 'median' },
      { label: '표준편차', value: 'std' },
      { label: '최솟값', value: 'min' },
      { label: '최댓값', value: 'max' },
      { label: '결측치 수', value: 'null_count' },
    ]

    const statLabels = {
      mean: '평균',
      median: '중앙값',
      std: '표준편차',
      min: '최솟값',
      max: '최댓값',
      null_count: '결측치 수'
    }

    function loadCsv(e) {
      const file = e.target.files[0]
      if (!file) return
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          dataRows.value = res.data
          columns.value = res.meta.fields
        }
      })
    }

    async function runStats() {
      const payload = {
        data: dataRows.value,
        columns: selectedColumns.value,
        stats: selectedStats.value
      }
      const res = await fetch('http://localhost:8000/api/basic-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const json = await res.json()
      results.value = json.results
      showPopup.value = false
    }

    return { columns, dataRows, showPopup, selectedStats, selectedColumns, results, statOptions, statLabels, loadCsv, runStats }
  }
}).mount('#app')

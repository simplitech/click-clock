<script lang="ts">
  import { avgDaysStatus, avgEstimativeError, sumTimeEstimate } from '$lib/utils/clickupServices'
  import { countUserNames, sumTimeTracked } from '$lib/utils/clockifyServices'
  import { formatDuration, formatDurationClock, formatDurationOnlyDays, type Report } from '$lib/utils/format'

  export let report: Report
</script>

<div class="table-summary min-w-[400px] max-w-[600px] rounded-l-lg" />
<div class="table-summary">Count: {countUserNames(report)}</div>
<div class="table-summary" />
<div class="table-summary">Sum: {formatDurationClock(sumTimeTracked(report))}</div>
<div class="table-summary">Sum: {formatDuration(sumTimeEstimate(report))}</div>
<div class="table-summary">Avg: {avgEstimativeError(report).toFixed(2)}</div>
<div class="table-summary" />
<div class="table-summary" />
<div class="table-summary" />
<div class="table-summary">Avg: {formatDurationOnlyDays(avgDaysStatus(report, 'to review'))}</div>
<div class="table-summary rounded-r-lg">Avg: {formatDurationOnlyDays(avgDaysStatus(report, 'to test'))}</div>

<style>
  .table-summary {
    @apply bg-dark-purple px-5 h-[46px] text-xs font-bold text-gray-400 text-center;
    display: flex;
    justify-content: center;
    align-items: center;
  }
</style>

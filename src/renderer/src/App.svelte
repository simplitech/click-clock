<script lang="ts">
  import { onMount } from 'svelte'
  import { getCacheItem, setCacheItem } from './cacheServices'
  import {
    getTimeEntryReportDetailed,
    formatUserNamesSortedByParticipation,
    sumDurations,
    getMainGroupOfDurations,
    clockifyUrl,
    calculateEstimationError,
  } from './clockifyServices'
  import {
    clickupIdFromText,
    getTask,
    getTaskListTime,
    getTaskTimeStatus,
    type BulkTimeStatus,
  } from './clickupServices'
  import DatetimeInput from './components/DatetimeInput.svelte'
  import Modal from './components/Modal.svelte'
  import Select from 'svelte-select'
  import { copyToClipboard, durationRoundUpByHalfHour, daysToMilis, getContrastColorHex, chunkArray } from './helper'
  import { formatReport, formatDuration, formatDurationWithDays, type Entry, formatDurationOnlyDays } from './format'
  import { version } from '../../../package.json'

  type SelectedValue = {
    value: string
    index: number
    label: string
  }

  type Report = {
    [id: string]: Entry
  }

  let report: Report = null
  let reportFiltered: Report = null
  let loading = false
  let configOpen = false
  let config = {
    clockifyApiKey: '',
    clockifyWorkspaceId: '6053a39bc15f5f7905d37b9d',
    clickupApiKey: '',
  }

  let projectFilter: string[] = []
  let statusFilter: string[] = []
  let assigneeFilter: string[] = []

  let selectedProject: SelectedValue[] = null
  let selectedStatus: SelectedValue[] = null
  let selectedAssignee: SelectedValue[] = null

  let now = new Date()
  let dateRangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
  let dateRangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

  let taskList: string[] = []

  let searchValue: string = null

  onMount(async () => {
    const cacheConfig = await getCacheItem('config')
    if (cacheConfig) {
      config = cacheConfig
    }
    if (!config.clockifyApiKey || !config.clickupApiKey) {
      configOpen = true
    } else {
      await generateReport()
      console.log(report)
    }
  })

  const generateReport = async () => {
    loading = true

    const clockifyEntries = await getClockifyEntries()
    const taskTimes = await getTasksTime()

    const resp = await matchTaskTime(clockifyEntries, taskTimes)

    report = resp
    reportFiltered = resp

    projectFilter = [
      ...new Set(
        Object.values(report).map((item: Entry) => item.task?.list.name ?? item.timeEntry?.[0]?.projectName ?? ''),
      ),
    ].sort()
    statusFilter = [...new Set(Object.values(report).map((item: Entry) => item.task?.status.status ?? ''))].sort()
    assigneeFilter = [
      ...new Set(
        Object.values(report)
          .map((item: Entry) => formatUserNamesSortedByParticipation(item.timeEntry).split(', '))
          .flat(),
      ),
    ].sort()

    handleFilters()

    loading = false
  }

  const getClockifyEntries = async () => {
    const clockifyData = await getTimeEntryReportDetailed(
      {
        dateRangeStart: dateRangeStart.toISOString(),
        dateRangeEnd: dateRangeEnd.toISOString(),
        detailedFilter: { page: 0, pageSize: 1000 },
      },
      config,
    )
    const resp: Report = {}
    taskList = []
    for (const clockifyEntry of clockifyData.timeentries) {
      let id = clickupIdFromText(clockifyEntry.description)
      const idFound = Boolean(id)
      id = id || clockifyEntry.description

      if (!resp[id]) {
        resp[id] = { timeEntry: [], task: null }
      }

      resp[id].timeEntry.push(clockifyEntry)

      if (idFound && !resp[id].task) {
        const cache = await getCacheItem(`clickup-task-${id}`)
        if (cache) {
          resp[id].task = cache
          taskList.push(id)
          continue
        }

        try {
          const clickupTask = await getTask(id, config)
          resp[id].task = clickupTask
          taskList.push(id)
          setCacheItem(`clickup-task-${id}`, clickupTask)
        } catch (e) {
          resp[id].taskError = e.response.data.err
          if (e.response.data.err.includes('Rate limit')) {
            break
          }
        }
      }
    }

    return resp
  }

  const getTasksTime = async () => {
    const tasksChunkList = chunkArray(taskList, 100)
    const taskTimes: BulkTimeStatus[] = []
    for (const taskChunk of tasksChunkList) {
      taskTimes.push(await getTaskListTime(taskChunk, config))
    }
    return taskTimes
  }

  const matchTaskTime = (report, taskTimes) => {
    taskTimes.forEach((task) => {
      Object.entries(task).forEach(([key, value]) => {
        report[key].task.timeStatus = value
      })
    })

    return report
  }

  const saveConfig = async () => {
    await setCacheItem('config', config, 365 * 24 * 60 * 60 * 1000)
    generateReport()
    configOpen = false
  }

  function handleFilters() {
    reportFiltered = report

    if (selectedStatus) {
      reportFiltered = Object.fromEntries(
        Object.entries(reportFiltered).filter(([, value]) =>
          Object.values(selectedStatus).some((status) => (value.task?.status.status ?? '') === status.value),
        ),
      )
    }

    if (selectedProject) {
      reportFiltered = Object.fromEntries(
        Object.entries(reportFiltered).filter(([, value]) =>
          Object.values(selectedProject).some(
            (project) => (value.task?.list.name ?? value.timeEntry?.[0]?.projectName ?? '') === project.value,
          ),
        ),
      )
    }

    if (selectedAssignee) {
      reportFiltered = Object.fromEntries(
        Object.entries(reportFiltered).filter(([, value]) =>
          Object.values(selectedAssignee).some((assignee) =>
            formatUserNamesSortedByParticipation(value.timeEntry)
              .split(', ')
              .some((name) => name === assignee.value),
          ),
        ),
      )
    }

    if (searchValue) {
      const searchFormatted = searchValue.toLowerCase()
      reportFiltered = Object.fromEntries(
        Object.entries(reportFiltered).filter(
          ([key, value]) =>
            key.toLowerCase().includes(searchFormatted) ||
            value.task?.id.toLowerCase().includes(searchFormatted) ||
            value.task?.name.toLowerCase().includes(searchFormatted),
        ),
      )
    }
  }

  const copyReportToClipboard = (report, format) => {
    let headers = Object.keys(formatReport).join('\t') + '\n'
    let rows = ''

    Object.entries(report).forEach(([id, entry]) => {
      Object.keys(format).forEach((reportItem) => {
        rows += format[reportItem](id, entry, dateRangeStart, dateRangeEnd)
        rows += '\t'
      })
      rows += '\n'
    })

    copyToClipboard(headers + rows)
  }
</script>

<main>
  <div class="flex h-full justify-between p-2">
    <h1 class="text-3xl font-bold">Clockify and ClickUp</h1>
    <div class="flex flex-row">
      <div class="p-5">
        <span>Version: </span>
        <span> {version} </span>
      </div>
      <button on:click={() => (configOpen = true)}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="w-6 h-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
          />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>
  </div>

  <div class="flex flex-row">
    <form on:submit|preventDefault={generateReport} class="flex m-3">
      <label class="flex flex-col mr-3">
        <span class="font-bold">Start Date</span>
        <DatetimeInput bind:value={dateRangeStart} class="bg-transparent" />
      </label>
      <label class="flex flex-col mr-3">
        <span class="font-bold">End Date</span>
        <DatetimeInput bind:value={dateRangeEnd} class="bg-transparent" />
      </label>
      <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" type="submit">
        Filter
      </button>
    </form>

    {#if !loading}
      <button
        class="border border-solid p-2 bg-green-500 hover:bg-green-700 text-white font-bold rounded m-3"
        on:click={() => copyReportToClipboard(reportFiltered, formatReport)}>Export</button
      >
    {/if}
  </div>

  {#if !loading}
    <form on:submit|preventDefault={handleFilters} class="flex flex-row items-center my-3">
      <div class="flex flex-row gap-x-5 px-3">
        <Select
          class="multiselect"
          on:input={handleFilters}
          bind:value={selectedProject}
          items={projectFilter}
          searchable
          multiple
          showChevron
          placeholder="Selecione um Projeto"
        />
        <Select
          class="multiselect"
          on:input={handleFilters}
          bind:value={selectedAssignee}
          items={assigneeFilter}
          searchable
          multiple
          showChevron
          placeholder="Selecione um Assignee"
        />
        <Select
          class="multiselect"
          on:input={handleFilters}
          bind:value={selectedStatus}
          items={statusFilter}
          searchable
          multiple
          showChevron
          placeholder="Selecione um Status"
        />
      </div>
      <input
        type="text"
        class="w-96 h-10 text-black p-2"
        bind:value={searchValue}
        placeholder="Search for ID or description"
      />
      <button
        type="submit"
        class="m-5 border border-solid p-2 bg-pink-500 hover:bg-pink-700 text-white font-bold rounded">Search</button
      >
    </form>
  {/if}

  {#if loading}
    <p>Loading...</p>
  {/if}
  {#if reportFiltered}
    <table class="min-w-full text-left text-sm font-light">
      <thead class="border-b font-medium dark:border-neutral-500">
        <tr>
          <th scope="col" class="p-3">Task ID</th>
          <th scope="col" class="p-3">Description</th>
          <th scope="col" class="p-3">Project</th>
          <th scope="col" class="p-3">Logged</th>
          <th scope="col" class="p-3">Logged Roundup</th>
          <th scope="col" class="p-3">Estimate</th>
          <th scope="col" class="p-3">L.Assignee seconds</th>
          <th scope="col" class="p-3">Estimate seconds</th>
          <th scope="col" class="p-3">Estimation Error</th>
          <th scope="col" class="p-3">First Log Date</th>
          <th scope="col" class="p-3">Last Log Date</th>
          <th scope="col" class="p-3">Status</th>
          <th scope="col" class="p-3">Tags</th>
          <th scope="col" class="p-3">Assignees</th>
          <th scope="col" class="p-3">Days in Review</th>
          <th scope="col" class="p-3">Days in Test</th>
        </tr>
      </thead>
      <tbody>
        {#each Object.entries(reportFiltered) as [id, entry]}
          <tr class="border-b dark:border-neutral-500">
            <td class="p-3 font-medium whitespace-nowrap">
              {entry.task ? id : 'Flex'}
              {#if entry.task}
                <a href={entry.task.url} target="_blank" class="text-blue-500 hover:text-blue-600">🔗</a>
              {/if}
            </td>
            <td class="p-3">
              <div class="w-64 whitespace-break-spaces">{entry.task?.name ?? id}</div>
              {#if entry.taskError}
                <div class="text-red-500">{entry.taskError}</div>
              {/if}
            </td>
            <td class="p-3">{entry.task?.list.name ?? entry.timeEntry?.[0]?.projectName ?? 'No project'}</td>
            <td class="p-3 flex whitespace-nowrap justify-between">
              <span>{formatDuration(sumDurations(entry.timeEntry))}</span>
              {#if entry.timeEntry?.length}
                <a href={clockifyUrl(dateRangeStart, dateRangeEnd, id)} target="_blank">🔎</a>
              {/if}
            </td>
            <td class="p-3">
              {formatDuration(durationRoundUpByHalfHour(sumDurations(entry.timeEntry)))}
            </td>
            <td class="p-3">{formatDuration(entry.task?.time_estimate / 1000)}</td>
            <td class="p-3">
              {getMainGroupOfDurations(entry.timeEntry)}
            </td>
            <td class="p-3">{(entry.task?.time_estimate ?? 0) / 1000}</td>
            <td class="p-3" class:text-red-300={calculateEstimationError(entry) > 2.5}>
              {calculateEstimationError(entry)}
            </td>
            <td class="p-3">
              {#if entry.timeEntry?.length}
                {entry.timeEntry[0]?.timeInterval?.start}
              {/if}
            </td>
            <td class="p-3">
              {#if entry.timeEntry?.length}
                {entry.timeEntry[entry.timeEntry.length - 1]?.timeInterval?.end}
              {/if}
            </td>
            <td class="p-3">
              {#if entry.task}
                <span
                  class="rounded-full px-3 py-1 text-sm font-semibold text-gray-700 mr-2 whitespace-nowrap"
                  style="background-color: {entry.task.status.color}; color: {getContrastColorHex(
                    entry.task.status.color,
                  )}"
                >
                  {entry.task.status.status}
                </span>
              {/if}
            </td>
            <td class="p-3">
              {#if entry.task}
                <div class="w-64">
                  {#each entry.task.tags as tag}
                    <span
                      class="rounded-full px-3 py-1 text-sm font-semibold text-gray-700 mr-2"
                      style="background-color: {tag.tag_bg}; color: {getContrastColorHex(tag.tag_bg)}"
                    >
                      {tag.name}
                    </span>
                  {/each}
                </div>
              {/if}
            </td>
            <td class="p-3">
              {formatUserNamesSortedByParticipation(entry.timeEntry)}
            </td>
            <td
              class="p-3"
              class:text-red-300={getTaskTimeStatus(entry.task?.timeStatus, 'to review') >= daysToMilis(3)}
            >
              {formatDurationOnlyDays(getTaskTimeStatus(entry.task?.timeStatus, 'to review'))}
            </td>
            <td class="p-3" class:text-red-300={getTaskTimeStatus(entry.task?.timeStatus, 'to test') >= daysToMilis(3)}>
              {formatDurationOnlyDays(getTaskTimeStatus(entry.task?.timeStatus, 'to test'))}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
  {#if configOpen}
    <Modal on:close={() => (configOpen = false)} title="Config">
      <form on:submit|preventDefault={saveConfig} class="flex flex-col m-3">
        <label class="mb-3">
          <div class="font-bold">Clockify API Key</div>
          <input type="text" bind:value={config.clockifyApiKey} class="w-64 bg-white dark:bg-black p-2 rounded" />
        </label>
        <label class="mb-3">
          <div class="font-bold">Clockify Workspace ID</div>
          <input type="text" bind:value={config.clockifyWorkspaceId} class="w-64 bg-white dark:bg-black p-2 rounded" />
        </label>
        <label class="mb-3">
          <div class="font-bold">ClickUp API Key</div>
          <input type="text" bind:value={config.clickupApiKey} class="w-64 bg-white dark:bg-black p-2 rounded" />
        </label>
        <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" type="submit">
          Save
        </button>
      </form>
    </Modal>
  {/if}
</main>

<style global>
  body {
    background-color: #001122;
    color: #eee;
  }

  .multiselect {
    color: black !important;
  }
</style>

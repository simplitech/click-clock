<script lang="ts">
  import { onMount } from 'svelte'
  import { Client, cacheExchange, fetchExchange } from '@urql/svelte'

  import { getToken } from '$lib/utils/cacheServices'
  import {
    calculateEstimationError,
    formatUserNamesSortedByParticipation,
    formatUserNamesDailyParticipation,
    getClockifyEntriesAPI,
  } from '$lib/utils/clockifyServices'
  import { clickupIdFromText, getLastStatus, getTaskTimeStatus } from '$lib/utils/clickupServices'
  import Modal from '$lib/components/Modal.svelte'
  import { daysToMilis } from '$lib/utils/helper'
  import Header from '$lib/components/Header.svelte'
  import Toolbar from '$lib/components/Toolbar.svelte'
  import {
    formatDayMonthYear,
    type Entry,
    type Filters,
    type Report,
    type Group,
    type FilterOptions,
  } from '$lib/utils/format'
  import Loading from '$lib/components/Loading.svelte'
  import { scale } from 'svelte/transition'
  import TableRender from '$lib/components/TableRender.svelte'
  import _ from 'lodash'
  import { showToast } from '$lib/utils/toast'
  import { validateAndSignIn, type Login } from '$lib/utils/loginServices'
  import { graphqlClient } from '$lib/utils/store'
  import type { ClickupTasksStatus, ClockifyTimeEntry } from '../graphql/generated'

  let report: Report = null
  let reportFiltered: Report = null
  let loading = false
  let loadingText = ''
  let loadingOrigin = ''

  let filters: Filters = {}
  let projectFilter: FilterOptions[] = []
  let statusFilter: FilterOptions[] = []
  let assigneeFilter: FilterOptions[] = []

  let selectedProject: FilterOptions[] = []
  let selectedStatus: FilterOptions[] = []
  let selectedAssignee: FilterOptions[] = []
  let selectedStatusInPeriod: FilterOptions[] = []
  let selectedGroupBy: FilterOptions[] = []
  let searchValue: string | null = null

  let now = new Date()
  let dateRangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
  let dateRangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

  let reportGroup: Group = {}
  let auxReportGroup: Group = {}

  let loginOpen = false
  let loginData: Login = {
    email: null,
    password: null,
  }

  $: showSummary = true
  $: showDetails = true
  $: showWarnings = true

  onMount(async () => {
    const token = await getToken()
    if (!token) {
      loginOpen = true
    } else {
      await generateReport()
    }
  })

  const setDateAndGenerate = async (event: CustomEvent) => {
    dateRangeStart = event.detail.dateRangeStart
    dateRangeEnd = event.detail.dateRangeEnd

    await generateReport()
  }

  const generateReport = async () => {
    loading = true

    const clockifyEntries = await getClockifyEntries()

    report = clockifyEntries
    reportFiltered = clockifyEntries

    projectFilter = [
      ...new Set(
        Object.values(report).map(
          (item: Entry) => item.task?.list.name ?? item.timeEntry?.[0]?.clockifyProject?.name ?? 'No Project',
        ),
      ),
    ]
      .sort()
      .map((filterItem: string) => ({ label: filterItem }))

    let index = projectFilter.findIndex((item) => item.label === 'No Project')
    projectFilter.unshift(projectFilter[index])
    projectFilter.splice(index + 1, 1)

    const statusMap: { [id: string]: FilterOptions } = {}
    Object.values(report).forEach((item: Entry) => {
      const status = item.task?.clickupTasksStatus

      status?.forEach((clickupStatus: ClickupTasksStatus) => {
        const name = clickupStatus.status.status
        if (!statusMap[name]) {
          statusMap[name] = {
            label: name,
            color: clickupStatus.status.color || '#c2c2c2',
          }
        }
      })
    })
    statusFilter = Object.values(statusMap)

    index = statusFilter.findIndex((item) => item.label === 'No Status')
    statusFilter.unshift(statusFilter[index])
    statusFilter.splice(index + 1, 1)

    assigneeFilter = [
      ...new Set(
        Object.values(report)
          .map((item: Entry) => formatUserNamesSortedByParticipation(item.timeEntry).split(', '))
          .flat(),
      ),
    ]
      .sort()
      .map((filterItem: string) => ({ label: filterItem }))

    filters = {
      project: projectFilter,
      status: statusFilter,
      assignee: assigneeFilter,
    }

    handleFilters()
    loading = false
  }

  const getClockifyEntries = async (): Promise<Report> => {
    loadingOrigin = 'Clockify...'

    let clockifyData: ClockifyTimeEntry[] = await getClockifyEntriesAPI(
      dateRangeStart.toISOString(),
      dateRangeEnd.toISOString(),
    )
    const resp: Report = {}

    for (const clockifyEntry of clockifyData) {
      let id = clickupIdFromText(clockifyEntry.description)
      /** Eu coloco a description + projeto por conta que podem existir 2
       * tasks flex com o mesmo nome, mas de projetos diferentes (Ex: CR)
       *  e como o id será usado como atributo do resp, então não daria
       *  pra ter vários atributos com mesmo nome. Como toda task tem
       *  pelo menos uma timeEntry, então deve se pegar o nome da issue
       *  por ela.
       */
      id = id || `${clockifyEntry.description} - ${clockifyEntry.clockifyProject?.name}`

      if (!resp[id]) {
        resp[id] = { timeEntry: [], task: clockifyEntry.clickupTask }
      }

      resp[id].timeEntry.push(clockifyEntry)
    }

    return resp
  }

  const setSearch = (event: CustomEvent) => {
    searchValue = event.detail.searchValue

    handleFilters()
  }

  const setFilterValue = (event: CustomEvent) => {
    selectedAssignee = event.detail.selectedAssignee
    selectedProject = event.detail.selectedProject
    selectedStatus = event.detail.selectedStatus
    selectedStatusInPeriod = event.detail.selectedStatusInPeriod
    selectedGroupBy = event.detail.selectedGroupBy
    showWarnings = event.detail.showWarnings
    showDetails = event.detail.showDetails

    handleFilters()
  }

  function handleFilters() {
    reportFiltered = _.cloneDeep(report)

    if (selectedStatus.length) {
      reportFiltered = Object.fromEntries(
        Object.entries(reportFiltered).filter(([, value]) =>
          Object.values(selectedStatus).some(
            (status: FilterOptions) =>
              (getLastStatus(value.task?.clickupTasksStatus)?.status.status ?? 'No Status') === status.label,
          ),
        ),
      )
    }

    if (selectedProject.length) {
      reportFiltered = Object.fromEntries(
        Object.entries(reportFiltered).filter(([, value]) =>
          Object.values(selectedProject).some(
            (project: FilterOptions) =>
              (value.task?.list.name ?? value.timeEntry[0]?.clockifyProject.name ?? 'No Project') === project.label,
          ),
        ),
      )
    }

    if (selectedAssignee.length) {
      reportFiltered = Object.fromEntries(
        Object.entries(reportFiltered).filter(([, value]) =>
          Object.values(selectedAssignee).some((assignee: FilterOptions) =>
            formatUserNamesSortedByParticipation(value.timeEntry)
              .split(', ')
              .some((name: string) => name === assignee.label),
          ),
        ),
      )

      Object.entries(reportFiltered).forEach(([, value]) => {
        value.timeEntry = value.timeEntry.filter((entry: ClockifyTimeEntry) =>
          Object.values(selectedAssignee).some((assignee: FilterOptions) => entry.user.name === assignee.label),
        )
      })
    }

    if (selectedStatusInPeriod.length) {
      reportFiltered = Object.fromEntries(
        Object.entries(reportFiltered).filter(([, value]) =>
          Object.values(selectedStatusInPeriod).some((timeInStatus: FilterOptions) => {
            if (!value.task) return false
            return checkIfStatusInRange(
              dateRangeStart,
              dateRangeEnd,
              value.task?.clickupTasksStatus,
              timeInStatus.label,
            )
          }),
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

    if (showWarnings && !showDetails) {
      reportFiltered = Object.fromEntries(
        Object.entries(reportFiltered).filter(
          ([, value]) =>
            calculateEstimationError(value) > 2.5 ||
            getTaskTimeStatus(value.task?.clickupTasksStatus, 'to review') >= daysToMilis(3) ||
            getTaskTimeStatus(value.task?.clickupTasksStatus, 'to test') >= daysToMilis(3),
        ),
      )
    }

    handleGroupBy()
  }

  const handleGroupBy = () => {
    reportGroup = {}
    auxReportGroup = {}

    if (selectedGroupBy.some((item: FilterOptions) => item.label === 'Date')) {
      for (const [idIssue, entry] of Object.entries(reportFiltered)) {
        const dates = new Set(entry.timeEntry.map((item) => formatDayMonthYear(item.timeInterval.start)))

        dates.forEach((date: string) => {
          if (!reportGroup[date]) {
            reportGroup[date] = {}
          }
          reportGroup[date][idIssue] = entry
        })
      }
    } else {
      reportGroup['allDates'] = reportFiltered
    }

    for (const [dateKey, value] of Object.entries(reportGroup)) {
      const group: Group = {}
      auxReportGroup[dateKey] = group

      if (selectedGroupBy.some((item: FilterOptions) => item.label === 'Project')) {
        for (const [taskKey, taskValue] of Object.entries(value)) {
          const entry = taskValue as Entry
          const projectKey = entry.task?.list.name ?? entry.timeEntry[0]?.clockifyProject.name ?? 'No project'
          if (!auxReportGroup[dateKey][projectKey]) {
            auxReportGroup[dateKey][projectKey] = {}
          }
          group[projectKey][taskKey] = entry
        }
      } else {
        auxReportGroup[dateKey]['allProjects'] = value as Report
      }
    }
    reportGroup = auxReportGroup

    auxReportGroup = {}
    for (const [key, value] of Object.entries(reportGroup)) {
      const keyGroup: Group = {}
      auxReportGroup[key] = keyGroup

      for (const [projKey, projVal] of Object.entries(value)) {
        const projectGroup: Group = {}
        keyGroup[projKey] = projectGroup

        if (selectedGroupBy.some((item: FilterOptions) => item.label === 'Assignee')) {
          for (const [taskKey, taskValue] of Object.entries<Entry>(projVal)) {
            const assignees =
              key === 'allDates'
                ? formatUserNamesSortedByParticipation(taskValue.timeEntry).split(', ').flat()
                : formatUserNamesDailyParticipation(taskValue.timeEntry, key)
            assignees.forEach((assignee) => {
              if (!projectGroup[assignee]) {
                projectGroup[assignee] = {}
              }
              projectGroup[assignee][taskKey] = taskValue as Entry
            })
          }
        } else {
          projectGroup['allAssignees'] = projVal as Report
        }
      }
    }
    reportGroup = auxReportGroup
  }

  const checkIfStatusInRange = (
    dateRangeStart: Date,
    dateRangeEnd: Date,
    statusHistory: ClickupTasksStatus[],
    selectedTimeInStatus: string,
  ) => {
    if (statusHistory) {
      statusHistory.sort((a: ClickupTasksStatus, b: ClickupTasksStatus) => b.createdAt - a.createdAt)

      // Pego todos os valores que estão no range da data, ordeno pelo mais atual e pego ele
      const valueInRange = statusHistory
        .filter(
          (item: ClickupTasksStatus) =>
            new Date(item.createdAt) >= dateRangeStart && new Date(item.createdAt) <= dateRangeEnd,
        )
        .sort((a: ClickupTasksStatus, b: ClickupTasksStatus) => b.createdAt - a.createdAt)
      // Se não existir valor no range, o status da issue não mudou no range de data filtrado. Então pega o status mais atual
      const valoresMenores = statusHistory
        .filter((item: ClickupTasksStatus) => new Date(item.createdAt) < dateRangeStart)
        .sort((a: ClickupTasksStatus, b: ClickupTasksStatus) => b.createdAt - a.createdAt)

      if (valueInRange.length) {
        return valueInRange[0].status.status === selectedTimeInStatus
      } else if (valoresMenores.length) {
        return valoresMenores[0].status.status === selectedTimeInStatus
      }

      return false
    } else {
      return false
    }
  }

  const client = new Client({
    url: import.meta.env.VITE_GRAPHQL_ENDPOINT ?? '',
    exchanges: [cacheExchange, fetchExchange],
    fetchOptions: {
      headers: {
        'content-type': 'application/json',
        Authorization: getToken(),
      },
    },
  })

  graphqlClient.set(client)

  const handleLogin = async () => {
    try {
      await validateAndSignIn(loginData)
      showToast('Login Successful!')

      loginOpen = false
    } catch (e) {
      showToast(e, 'red')
    }
  }
</script>

<main class="text-white py-10 px-4 bg-dark-blue min-h-screen min-w-[1350px] overflow-y-auto">
  <Header
    class="mb-10 h-[87px] min-w-[1300px]"
    {dateRangeStart}
    {dateRangeEnd}
    disabled={loading}
    on:generate={setDateAndGenerate}
    on:openLoginModal={() => (loginOpen = true)}
    on:search={setSearch}
  />

  {#if loading}
    <div transition:scale={{ duration: 500 }}>
      <Loading {loadingText} {loadingOrigin} />
    </div>
  {/if}

  <Toolbar
    report={reportFiltered}
    {dateRangeStart}
    {dateRangeEnd}
    {filters}
    disabled={loading}
    bind:showDetails
    bind:showSummary
    bind:showWarnings
    on:doFilter={setFilterValue}
    class="min-w-[1300px] h-[73px] mb-10"
  />

  {#if reportGroup}
    <TableRender
      class="min-w-[1300px]"
      {reportGroup}
      {selectedGroupBy}
      {dateRangeEnd}
      {dateRangeStart}
      bind:showDetails
      bind:showSummary
      bind:showWarnings
    />
  {/if}

  {#if loginOpen}
    <Modal on:close={() => (loginOpen = false)} title="Login">
      <form on:submit|preventDefault={handleLogin} class="flex flex-col items-center justify-center w-full pt-5 pb-10">
        <label class="mb-4">
          <div class="font-semibold mb-1">E-mail</div>
          <input
            type="email"
            bind:value={loginData.email}
            class="w-96 bg-transparent border p-2 rounded focus:outline-none focus:border-lilac focus:border-2"
          />
        </label>
        <label class="mb-10">
          <div class="font-semibold mb-1">Password</div>
          <input
            type="password"
            bind:value={loginData.password}
            class="w-96 bg-transparent border p-2 rounded focus:outline-none focus:border-lilac focus:border-2"
          />
        </label>
        <button
          class="w-96 bg-lilac text-white font-bold py-2 px-4 rounded transition duration-500 hover:scale-110"
          type="submit"
        >
          Login
        </button>
      </form>
    </Modal>
  {/if}
</main>
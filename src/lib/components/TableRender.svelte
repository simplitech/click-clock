<script lang="ts">
  import type { Group, Report, FilterOptions } from '$lib/utils/format'
  import type { OrderBy } from '$lib/utils/orderby'
  import GroupTitle from './GroupTitle.svelte'
  import Table from './Table.svelte'
  import { GroupByEnum } from '$lib/enums/GroupByEnum'

  export let reportGroup: Group
  export let selectedGroupBy: FilterOptions[]
  export let dateRangeStart: Date
  export let dateRangeEnd: Date
  export let showSummary = true
  export let showDetails = true
  export let showWarnings = true
  export let level = 0
  export let orderBy: OrderBy

  const asReport = (item: Group | Report) => {
    return item as Report
  }

  $: getGroupTitle = () => {
    if (level >= Object.values(GroupByEnum).length) return false
    const groupByLabel = Object.values(GroupByEnum)[level]
    return selectedGroupBy?.some((item: FilterOptions) => item.label.trim() === (groupByLabel as string))
  }
</script>

<div class={$$props.class}>
  {#each Object.entries(reportGroup) as [key, value]}
    <div class={getGroupTitle() ? 'border border-gray-400 p-5 rounded-lg mb-5' : ''}>
      {#if getGroupTitle()}
        <GroupTitle title={key} />
      {/if}
      {#if level < Object.keys(GroupByEnum).length - 1}
        <svelte:self
          reportGroup={value}
          {selectedGroupBy}
          {dateRangeEnd}
          {dateRangeStart}
          {showDetails}
          {showSummary}
          {showWarnings}
          {orderBy}
          level={level + 1}
          on:orderBy
        />
      {:else}
        <Table
          {dateRangeStart}
          {dateRangeEnd}
          {orderBy}
          bind:showSummary
          bind:showDetails
          bind:showWarnings
          class="w-full mb-8"
          report={asReport(value)}
          on:orderBy
        />
      {/if}
    </div>
  {/each}
</div>

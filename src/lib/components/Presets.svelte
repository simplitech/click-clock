<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import TrashIcon from './icons/TrashIcon.svelte'
  import { showToast } from '$lib/utils/toast'
  import Modal from '$lib/components/Modal.svelte'
  import Popover from './Popover.svelte'
  import type { FilterPreset } from '$lib/utils/format'

  let isOpen = false
  let presetToDelete: FilterPreset

  const dispatch = createEventDispatcher()

  $: presets = () => JSON.parse(localStorage.getItem('presets')) ?? []

  const applyPreset = (preset: FilterPreset) => {
    dispatch('applyPreset', preset)
    isOpen = false
    showToast('Filter preset successfully applied')
  }

  const handleDelete = (preset: FilterPreset) => {
    presetToDelete = preset
  }

  const deletePreset = () => {
    const filtered = presets().filter((item: FilterPreset) => item.name !== presetToDelete.name)
    localStorage.setItem('presets', JSON.stringify(filtered))
    showToast('Filter preset successfully deleted')
    presetToDelete = null
  }
</script>

<Popover contentClass="right-0" bind:isOpen>
  <div
    class="flex flex-row items-center justify-center border border-white rounded-full py-2 px-4 whitespace-nowrap"
    slot="button"
  >
    Your Presets
  </div>
  <div class="bg-purple-gray-300 flex flex-col gap-y-2 rounded-md py-3 px-4 min-w-[228px]" slot="content">
    {#if presets().length}
      {#each presets() as preset}
        <div class="flex items-center justify-between gap-x-2">
          {preset.name}
          <div class="flex items-center gap-x-2">
            <button
              class="bg-lilac text-white font-bold py-1 px-3 rounded-full w-fit"
              on:click={() => applyPreset(preset)}>Apply</button
            >
            <button on:click={() => handleDelete(preset)} class="group">
              <TrashIcon svgClass="group-hover:fill-lilac fill-gray-300" />
            </button>
          </div>
        </div>
      {/each}
    {:else}
      No presets found
    {/if}
  </div>
</Popover>

{#if presetToDelete != null}
  <Modal width="w-[370px]" on:close={() => (presetToDelete = null)}>
    <div class="items-center justify-center flex flex-col gap-y-6 text-center px-4 pb-4">
      <span class="text-xl font-bold">Are you sure you want to delete this preset?</span>

      <div class="flex gap-x-4">
        <button class="py-1 bg-lilac text-white font-bold rounded-full w-[112px]" on:click={deletePreset}>Yes</button>
        <button
          class="py-1 border border-white rounded-full whitespace-nowrap w-[112px]"
          on:click={() => (presetToDelete = null)}>No</button
        >
      </div>
    </div>
  </Modal>
{/if}

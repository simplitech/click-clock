<script lang="ts">
  import { getUserInitials } from '$lib/utils/format'

  export let tagText = 'Currently Running'
  export let userName: string
</script>

<div
  class="w-fit flex flex-row border border-lilac bg-lilac/[0.13] px-2 text-[13px] items-center justify-center gap-x-2 rounded"
>
  <img src="./images/clock.svg" alt="clock icon" class="w-3 h-3" />
  <span>
    {tagText}
    <span class="text-lilac">{' | '}</span>
    <span class="font-bold" title={userName}>
      {getUserInitials(userName)}
    </span>
  </span>
</div>

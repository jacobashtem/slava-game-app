<script setup lang="ts">
defineProps<{ small?: boolean }>()
</script>

<template>
  <div :class="['card-back', { small }]">
    <div class="card-back-pattern">
      <div class="card-back-symbol">&#10070;</div>
    </div>
  </div>
</template>

<style scoped>
.card-back {
  width: 80px;
  height: 112px;
  border-radius: 6px;
  border: 2px solid #1e293b;
  background: url('~/assets/cards/back.png') center / cover no-repeat;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-back.small {
  width: 52px;
  height: 72px;
}

.card-back-pattern {
  display: none;
}

.card-back-symbol {
  display: none;
}
</style>

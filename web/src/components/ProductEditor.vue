<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { api } from '@/api/client';
import { useToastStore } from '@/stores/toast';
import Modal from '@/components/Modal.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';
import { PRODUCT_CATEGORIES } from '@/utils/categories';

const props = defineProps<{ modelValue: boolean; product?: any }>();
const emit = defineEmits<{ 'update:modelValue': [v: boolean]; saved: [] }>();

const toast = useToastStore();
const isEdit = computed(() => !!props.product);
const name = ref('');
const cost = ref(20);
const stock = ref(-1);
const unlimited = ref(true);
const icon = ref('gift');
const saving = ref(false);

watch(() => props.modelValue, (open) => {
  if (open) {
    if (props.product) {
      name.value = props.product.name;
      cost.value = props.product.cost;
      stock.value = props.product.stock;
      unlimited.value = props.product.stock === -1;
      icon.value = props.product.icon || 'gift';
    } else {
      name.value = '';
      cost.value = 20;
      stock.value = -1;
      unlimited.value = true;
      icon.value = 'gift';
    }
  }
});

async function save() {
  if (!name.value.trim()) return toast.warning('请输入商品名称');
  if (cost.value <= 0) return toast.warning('积分必须大于0');
  if (!unlimited.value && stock.value < 0) return toast.warning('库存不能小于0');

  saving.value = true;
  try {
    const body = {
      name: name.value.trim(),
      cost: cost.value,
      stock: unlimited.value ? -1 : stock.value,
      icon: icon.value,
    };
    if (isEdit.value) {
      await api.patch(`/products/${props.product.id}`, body);
      toast.success('已更新');
    } else {
      await api.post('/products', body);
      toast.success('商品已添加 🎁');
    }
    emit('saved');
  } catch (e: any) { toast.error(e.message); }
  finally { saving.value = false; }
}
</script>

<template>
  <Modal :model-value="modelValue" :title="isEdit ? '编辑商品' : '新增商品'" @update:model-value="emit('update:modelValue', $event)">
    <div class="form">
      <div class="field">
        <label class="label">分类图标</label>
        <div class="icon-grid">
          <button
            v-for="c in PRODUCT_CATEGORIES"
            :key="c.key"
            type="button"
            :class="['icon-chip', { active: icon === c.key }]"
            @click="icon = c.key"
          >
            <CategoryIcon :icon="c.key" :size="40" />
            <span class="icon-label">{{ c.label }}</span>
          </button>
        </div>
      </div>
      <div class="field">
        <label class="label">商品名称</label>
        <input v-model="name" type="text" maxlength="50" placeholder="如：冰淇淋一次" />
      </div>
      <div class="field">
        <label class="label">所需积分</label>
        <input v-model.number="cost" type="number" min="1" max="99999" />
      </div>
      <div class="field">
        <label class="label">
          <input v-model="unlimited" type="checkbox" class="checkbox" />
          不限库存
        </label>
        <input v-if="!unlimited" v-model.number="stock" type="number" min="0" placeholder="库存数量" />
      </div>
    </div>
    <template #footer>
      <span style="flex:1"></span>
      <button class="btn btn-ghost" @click="emit('update:modelValue', false)">取消</button>
      <button class="btn btn-primary" @click="save" :disabled="saving">
        {{ saving ? '保存中...' : '保存' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 16px; }
.field { display: flex; flex-direction: column; gap: 8px; }
.label { font-size: 13px; color: var(--text-secondary); padding-left: 4px; display: flex; align-items: center; gap: 6px; }
.checkbox { width: auto; }

.icon-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.icon-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 4px;
  border-radius: var(--r-md);
  background: var(--glass-bg);
  border: 2px solid transparent;
  transition: all 0.2s;
  cursor: pointer;
}
.icon-chip.active {
  border-color: var(--accent-yellow);
  background: rgba(255, 209, 102, 0.15);
}
.icon-chip { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.icon-label { font-size: 11px; color: var(--text-secondary); font-family: var(--font-cute); }
</style>

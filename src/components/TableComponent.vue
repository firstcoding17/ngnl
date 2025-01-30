<template>
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th v-for="(col, index) in localTableData.columns" :key="index">
            <input
              v-model="localTableData.columns[index]"
              placeholder="Column Name"
              @input="emitUpdate"
            />
          </th>
          <th><button @click="addColumn">+</button></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, rowIndex) in localTableData.rows" :key="rowIndex">
          <td v-for="(cell, colIndex) in row" :key="colIndex">
            <input
              v-model="localTableData.rows[rowIndex][colIndex]"
              @input="emitUpdate"
            />
          </td>
          <td><button @click="removeRow(rowIndex)">-</button></td>
        </tr>
      </tbody>
    </table>
    <button @click="addRow">Add Row</button>
  </div>
</template>

<script>
export default {
  props: {
    tableData: Object, // 부모로부터 전달받은 테이블 데이터 (읽기 전용)
  },
  data() {
    return {
      localTableData: JSON.parse(JSON.stringify(this.tableData)), // ✅ props 복사해서 로컬에서 수정
    };
  },
  methods: {
    emitUpdate() {
      this.$emit("update-data", this.localTableData); // ✅ 변경된 데이터를 부모에게 전달
    },
    addRow() {
      this.localTableData.rows.push(
        new Array(this.localTableData.columns.length).fill("")
      );
      this.emitUpdate();
    },
    removeRow(index) {
      this.localTableData.rows.splice(index, 1);
      this.emitUpdate();
    },
    addColumn() {
      this.localTableData.columns.push(
        `Column ${this.localTableData.columns.length + 1}`
      );
      this.localTableData.rows.forEach((row) => row.push(""));

      // ✅ 컬럼 추가 시 테이블 크기 증가
      this.$nextTick(() => {
        const table = this.$el.querySelector("table");
        if (table) {
          table.style.minWidth = `${table.offsetWidth + 120}px`; // ✅ 컬럼 추가 시 120px 증가
        }
      });

      this.emitUpdate();
    },
  },
  watch: {
    tableData: {
      handler(newData) {
        this.localTableData = JSON.parse(JSON.stringify(newData)); // ✅ 부모 데이터 변경 시 업데이트
      },
      deep: true,
    },
  },
};
</script>
<style>
.table-container {
  width: 100%;
  height: 100%;
  padding: 10px;
}

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: auto; /* ✅ 셀 크기 자동 확장 */
}

th,
td {
  border: 1px solid #ccc;
  padding: 8px;
  text-align: left;
  min-width: 100px;
  white-space: nowrap; /* ✅ 텍스트 길면 자동 확장 */
}

input {
  width: 100%;
  border: none;
  outline: none;
  padding: 5px;
}

button {
  padding: 5px 10px;
  cursor: pointer;
}
</style>

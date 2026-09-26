import type { DbColumnInfo, DbForeignKeyInfo, DbIndexInfo } from '@shared/types/database-workspace'

export function mapPgColumns(
  rows: Array<Record<string, unknown>>,
  pkSet: Set<string>,
  fkRows: Array<Record<string, unknown>>
): DbColumnInfo[] {
  const fkMap = new Map(fkRows.map((f) => [String(f.column_name), f]))
  return rows.map((c, i) => {
    const name = String(c.column_name)
    const fk = fkMap.get(name)
    return {
      name,
      dataType: String(c.data_type),
      nullable: c.is_nullable === 'YES',
      defaultValue: c.column_default != null ? String(c.column_default) : null,
      isPrimaryKey: pkSet.has(name),
      isForeignKey: Boolean(fk),
      isUnique: false,
      isAutoIncrement: String(c.column_default ?? '').includes('nextval'),
      isGenerated: false,
      comment: null,
      maxLength: c.character_maximum_length != null ? Number(c.character_maximum_length) : null,
      precision: c.numeric_precision != null ? Number(c.numeric_precision) : null,
      scale: c.numeric_scale != null ? Number(c.numeric_scale) : null,
      ordinalPosition: Number(c.ordinal_position ?? i + 1),
      referencedTable: fk ? String(fk.foreign_table) : undefined,
      referencedColumn: fk ? String(fk.foreign_column) : undefined
    }
  })
}

export function mapPgIndexes(rows: Array<Record<string, unknown>>): DbIndexInfo[] {
  return rows.map((r) => ({
    name: String(r.indexname),
    columns: [],
    unique: String(r.indexdef).includes('UNIQUE'),
    primary: String(r.indexname).endsWith('_pkey'),
    type: 'btree'
  }))
}

export function mapPgForeignKeys(rows: Array<Record<string, unknown>>): DbForeignKeyInfo[] {
  return rows.map((r) => ({
    name: String(r.constraint_name),
    column: String(r.column_name),
    referencedTable: String(r.foreign_table),
    referencedColumn: String(r.foreign_column),
    onDelete: null,
    onUpdate: null
  }))
}

export function mapMySqlColumns(
  rows: Array<Record<string, unknown>>,
  pkSet: Set<string>
): DbColumnInfo[] {
  return rows.map((c, i) => ({
    name: String(c.COLUMN_NAME),
    dataType: String(c.COLUMN_TYPE ?? c.DATA_TYPE),
    nullable: c.IS_NULLABLE === 'YES',
    defaultValue: c.COLUMN_DEFAULT != null ? String(c.COLUMN_DEFAULT) : null,
    isPrimaryKey: pkSet.has(String(c.COLUMN_NAME)),
    isForeignKey: c.COLUMN_KEY === 'MUL',
    isUnique: c.COLUMN_KEY === 'UNI',
    isAutoIncrement: String(c.EXTRA ?? '').includes('auto_increment'),
    isGenerated: String(c.EXTRA ?? '').includes('GENERATED'),
    comment: c.COLUMN_COMMENT ? String(c.COLUMN_COMMENT) : null,
    maxLength: c.CHARACTER_MAXIMUM_LENGTH != null ? Number(c.CHARACTER_MAXIMUM_LENGTH) : null,
    precision: c.NUMERIC_PRECISION != null ? Number(c.NUMERIC_PRECISION) : null,
    scale: c.NUMERIC_SCALE != null ? Number(c.NUMERIC_SCALE) : null,
    ordinalPosition: Number(c.ORDINAL_POSITION ?? i + 1)
  }))
}

export function mapMySqlIndexes(rows: Array<Record<string, unknown>>): DbIndexInfo[] {
  const grouped = new Map<string, DbIndexInfo>()
  for (const r of rows) {
    const name = String(r.Key_name)
    const existing = grouped.get(name) ?? {
      name,
      columns: [],
      unique: r.Non_unique === 0,
      primary: name === 'PRIMARY',
      type: String(r.Index_type ?? 'BTREE')
    }
    existing.columns.push(String(r.Column_name))
    grouped.set(name, existing)
  }
  return [...grouped.values()]
}

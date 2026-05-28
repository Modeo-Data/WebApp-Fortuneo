export const PLATFORMS = {
  airbyte:    { id: 'airbyte',    name: 'Airbyte',     color: '#615EFF', textColor: '#fff' },
  fivetran:   { id: 'fivetran',   name: 'Fivetran',    color: '#0073FF', textColor: '#fff' },
  stitch:     { id: 'stitch',     name: 'Stitch',      color: '#65B3EF', textColor: '#fff' },
  kafka:      { id: 'kafka',      name: 'Kafka',       color: '#231F20', textColor: '#fff' },
  excel:      { id: 'excel',      name: 'Excel',       color: '#217346', textColor: '#fff' },
  airflow:    { id: 'airflow',    name: 'Airflow',     color: '#017CEE', textColor: '#fff' },
  dbt:        { id: 'dbt',        name: 'dbt',         color: '#FF694B', textColor: '#fff' },
  spark:      { id: 'spark',      name: 'Spark',       color: '#E25A1C', textColor: '#fff' },
  databricks: { id: 'databricks', name: 'Databricks',  color: '#FF3621', textColor: '#fff' },
  snowflake:  { id: 'snowflake',  name: 'Snowflake',   color: '#29B5E8', textColor: '#fff' },
  sql:        { id: 'sql',        name: 'SQL',         color: '#00758F', textColor: '#fff' },
  python:     { id: 'python',     name: 'Python',      color: '#3776AB', textColor: '#fff' },
  powerbi:    { id: 'powerbi',    name: 'Power BI',    color: '#F2C811', textColor: '#1a1a1a' },
  looker:     { id: 'looker',     name: 'Looker',      color: '#4285F4', textColor: '#fff' },
  tableau:    { id: 'tableau',    name: 'Tableau',     color: '#E97627', textColor: '#fff' },
  metabase:   { id: 'metabase',   name: 'Metabase',    color: '#509EE3', textColor: '#fff' },
  custom:     { id: 'custom',     name: 'Custom',      color: '#94A3B8', textColor: '#fff' },
}

// Deux transitions : ingestion (source→transfo) et transformation (transfo→kpi)
export const LAYER_DEFAULTS = {
  ingestion:      'airbyte',
  transformation: 'dbt',
}

export const LAYER_OPTIONS = {
  ingestion:      ['airbyte', 'fivetran', 'stitch', 'kafka', 'excel', 'airflow', 'spark', 'python', 'custom'],
  transformation: ['dbt', 'airflow', 'spark', 'databricks', 'snowflake', 'sql', 'python', 'custom'],
}

export const LAYER_LABELS = {
  ingestion:      'Ingestion',
  transformation: 'Transform',
}

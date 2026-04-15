import { memo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'

function formatCellValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function formatColumnHeader(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function ArrayTable({ data }: { data: Record<string, unknown>[] }) {
  const columns = Array.from(
    new Set(data.flatMap((row) => Object.keys(row))),
  )

  return (
    <div className="max-h-96 overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col}>{formatColumnHeader(col)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={i}>
              {columns.map((col) => (
                <TableCell key={col}>
                  {formatCellValue(row[col])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function ObjectDetail({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data)

  return (
    <div className="overflow-auto rounded-md border">
      <Table>
        <TableBody>
          {entries.map(([key, value]) => (
            <TableRow key={key}>
              <TableCell className="font-medium text-muted-foreground">
                {formatColumnHeader(key)}
              </TableCell>
              <TableCell>{formatCellValue(value)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export const ToolResultDisplay = memo(function ToolResultDisplay({
  output,
}: {
  output: unknown
}) {
  if (output == null) return null

  if (
    Array.isArray(output) &&
    output.length > 0 &&
    typeof output[0] === 'object' &&
    output[0] !== null
  ) {
    return <ArrayTable data={output as Record<string, unknown>[]} />
  }

  if (typeof output === 'object' && !Array.isArray(output)) {
    return <ObjectDetail data={output as Record<string, unknown>} />
  }

  return (
    <pre className="overflow-auto rounded-md border bg-muted p-3 text-xs text-muted-foreground">
      {String(output)}
    </pre>
  )
})

import * as gql from './graphql/generated'
import { formatDurationClock, type Entry, type Report, formatDayMonthYear } from './format'
import { getGraphqlClient } from './store'
import { parse, toSeconds } from 'iso8601-duration'
import { getLastEstimative } from './clickupServices'

function sortUserDurations(entries: gql.ClockifyTimeEntry[]): { user: string; duration: number }[] {
  const users = entries.map((item) => item.user.name)
  const uniqueUsers = [...new Set(users)]
  const userDurations = uniqueUsers.map((user) => {
    const userEntries = entries.filter((item) => item.user.name === user)
    return {
      user,
      duration: sumDurations(userEntries),
    }
  })
  return userDurations.sort((a, b) => b.duration - a.duration)
}

export function sumDurations(entries: gql.ClockifyTimeEntry[]) {
  return entries.map((item) => toSeconds(parse(item.timeInterval.duration))).reduce((a, b) => a + b, 0)
}

/**
 * This method will return a string with the names of the users sorted by the sum of durations of their entries
 * @param entries
 */
export function formatUserNamesSortedByParticipation(entries: gql.ClockifyTimeEntry[] | null): string {
  if (!entries) return ''
  const sortedUserDurations = sortUserDurations(entries)
  return sortedUserDurations.map((item) => item.user).join(', ')
}

export function formatUserNamesDailyParticipation(entries: gql.ClockifyTimeEntry[] | null, date: string) {
  if (!entries) return []
  const filteredEntriesByDay = entries.filter((item) => formatDayMonthYear(item.timeInterval.start) === date)
  const users = [...new Set(filteredEntriesByDay.map((item) => item.user.name))]
  return users
}

export function getUserParticipation(entries: gql.ClockifyTimeEntry[] | null, username: string): string {
  if (!entries) return ''
  const userEntries = entries.filter((item) => item.user.name === username.trim())
  return formatDurationClock(sumDurations(userEntries))
}

export function getMainGroupOfDurations(entries: gql.ClockifyTimeEntry[]): number {
  if (!entries) return 0
  const sortedUserDurations = sortUserDurations(entries)
  return sortedUserDurations[0]?.duration ?? 0
}

export const clockifyUrl = (dateRangeStart: Date, dateRangeEnd: Date, description: string): string => {
  return `https://app.clockify.me/reports/detailed?start=${dateRangeStart.toISOString()}&end=${dateRangeEnd.toISOString()}&description=${encodeURI(
    description,
  )}&page=1&pageSize=1000`
}

export const calculateEstimationError = (entry: Entry): number => {
  const estimation = (getLastEstimative(entry.task?.clickupTasksTimeEstimates)?.estimate ?? 0) / 1000
  return estimation ? Number((getMainGroupOfDurations(entry.timeEntry) / estimation).toFixed(2)) : 0
}

export const countUserNames = (report: Report | null): number => {
  return [
    ...new Set(
      Object.values(report)
        .map((item: Entry) => formatUserNamesSortedByParticipation(item.timeEntry).split(', '))
        .flat(),
    ),
  ].length
}

export const sumTimeTracked = (report: Report) => {
  return formatDurationClock(
    Object.values(report)
      .map((item: Entry) => sumDurations(item.timeEntry))
      .reduce((a, b) => a + b, 0),
  )
}

export async function getClockifyEntriesAPI(startDate: string, endDate: string): Promise<gql.ClockifyTimeEntry[]> {
  const result = await getGraphqlClient()
    .query(gql.ClockifyTimeEntriesDocument, {
      where: {
        timeInterval: { is: { start: { gte: startDate }, end: { lte: endDate } } },
        currentlyRunning: { equals: false },
      },
    })
    .toPromise()

  return result.data.clockifyTimeEntries as gql.ClockifyTimeEntry[]
}

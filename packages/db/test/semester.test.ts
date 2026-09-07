import assert from 'node:assert/strict'
import test from 'node:test'
import { latestSemester, parseSemester, semesterRank } from '../src/semester'

test('parses full and abbreviated semester names without a hardcoded year list', () => {
  assert.equal(parseSemester('CS 189 Fall 2026'), 'FA26')
  assert.equal(parseSemester('CS 189 2027 Fall'), 'FA27')
  assert.equal(parseSemester('COMPSCI 162-SP27'), 'SP27')
  assert.equal(parseSemester('course_su2028'), 'SU28')
  assert.equal(parseSemester('orientation'), null)
})

test('advances chronologically and never selects an older fetched term', () => {
  assert.ok(semesterRank('FA26') > semesterRank('SU26'))
  assert.ok(semesterRank('SP27') > semesterRank('FA26'))
  assert.equal(latestSemester(['SP26', 'FA25'], 'FA26'), 'FA26')
  assert.equal(latestSemester(['SP27', 'FA26'], 'FA26'), 'SP27')
})

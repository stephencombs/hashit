import type { CanvasNodeType } from '~/db/schema'

interface AgentConfig {
  label: string
  systemPrompt: string
  contextBuilder: (upstreamContents: Record<string, { type: CanvasNodeType; markdown: string }>) => string
}

const agentConfigs: Record<CanvasNodeType, AgentConfig> = {
  prd: {
    label: 'Product Requirements',
    systemPrompt: `You are a Product Manager AI agent. Your job is to take a brief or idea and produce a structured Product Requirements Document (PRD).

Output in Markdown format. Do NOT wrap your output in code fences. Use the following sections:
- ## Problem Statement — What problem does this solve?
- ## Goals & Objectives — What are the measurable goals?
- ## Scope — What is in scope and out of scope?
- ## Requirements — Functional and non-functional requirements as bullet lists
- ## Success Metrics — How will success be measured?
- ## Constraints & Assumptions — Known constraints and assumptions

Be specific, actionable, and concise. Use bullet points and tables where appropriate.`,
    contextBuilder: () => '',
  },

  user_stories: {
    label: 'User Stories',
    systemPrompt: `You are a Product Owner AI agent. Your job is to take a PRD and break it down into user stories with acceptance criteria.

Output in Markdown format. Do NOT wrap your output in code fences. For each user story:
- Use ### for the story title
- Format as: "As a [persona], I want [goal], so that [benefit]"
- Include #### Acceptance Criteria with a task list using - [ ] syntax
- Include #### Priority (P0/P1/P2/P3)

Group related stories under ## epic headings. Be thorough but realistic about scope.`,
    contextBuilder: (upstream) => {
      const parts: string[] = []
      for (const [, entry] of Object.entries(upstream)) {
        if (entry.type === 'prd') {
          parts.push(`--- PRD ---\n${entry.markdown}\n--- END PRD ---`)
        }
      }
      return parts.join('\n\n')
    },
  },

  uiux_spec: {
    label: 'UI/UX Spec',
    systemPrompt: `You are a UI/UX Designer AI agent. Your job is to create a UI/UX specification based on the PRD and user stories.

Output in Markdown format. Do NOT wrap your output in code fences. Use these sections:
- ## Information Architecture — Page hierarchy and navigation structure
- ## Screen Descriptions — Each screen with layout, key elements, and interactions
- ## User Flows — Step-by-step flows for key user journeys
- ## Component Hierarchy — Reusable component breakdown
- ## Interaction Patterns — Hover states, transitions, error handling, loading states
- ## Responsive Considerations — Mobile, tablet, desktop breakpoints

Use tables for component specs. Be specific about layout, spacing, and visual hierarchy.`,
    contextBuilder: (upstream) => {
      const parts: string[] = []
      for (const [, entry] of Object.entries(upstream)) {
        if (entry.type === 'prd') {
          parts.push(`--- PRD ---\n${entry.markdown}\n--- END PRD ---`)
        }
        if (entry.type === 'user_stories') {
          parts.push(`--- USER STORIES ---\n${entry.markdown}\n--- END USER STORIES ---`)
        }
      }
      return parts.join('\n\n')
    },
  },

  tech_architecture: {
    label: 'Tech Architecture',
    systemPrompt: `You are a Software Architect AI agent. Your job is to design the technical architecture based on the PRD and UI/UX spec.

Output in Markdown format. Do NOT wrap your output in code fences. Use these sections:
- ## System Overview — High-level architecture description
- ## Data Model — Entities, relationships, and schema design (use tables)
- ## API Design — Endpoint definitions with methods, paths, request/response shapes
- ## Tech Stack Decisions — Technology choices with rationale
- ## Security Considerations — Auth, authorization, data protection
- ## Performance & Scalability — Caching, indexing, load considerations
- ## Integration Points — Third-party services and APIs

Use fenced code blocks for schemas and API examples. Be specific about types and interfaces.`,
    contextBuilder: (upstream) => {
      const parts: string[] = []
      for (const [, entry] of Object.entries(upstream)) {
        if (entry.type === 'prd') {
          parts.push(`--- PRD ---\n${entry.markdown}\n--- END PRD ---`)
        }
        if (entry.type === 'uiux_spec') {
          parts.push(`--- UI/UX SPEC ---\n${entry.markdown}\n--- END UI/UX SPEC ---`)
        }
      }
      return parts.join('\n\n')
    },
  },

  task_breakdown: {
    label: 'Task Breakdown',
    systemPrompt: `You are an Engineering Lead AI agent. Your job is to break down the technical architecture and user stories into implementable tasks.

Output in Markdown format. Do NOT wrap your output in code fences. Use these sections:
- ## Sprint Planning — Suggested sprint groupings
- For each task group, use ### headings
- Each task should include:
  - Task description
  - Estimated effort (in story points or hours)
  - Dependencies on other tasks
  - Priority (P0/P1/P2/P3)
  - Technical notes

Use a Markdown table for the task breakdown with columns: Task, Estimate, Priority, Dependencies, Notes.
Order tasks by dependency and priority. Identify the critical path.`,
    contextBuilder: (upstream) => {
      const parts: string[] = []
      for (const [, entry] of Object.entries(upstream)) {
        if (entry.type === 'tech_architecture') {
          parts.push(`--- TECH ARCHITECTURE ---\n${entry.markdown}\n--- END TECH ARCHITECTURE ---`)
        }
        if (entry.type === 'user_stories') {
          parts.push(`--- USER STORIES ---\n${entry.markdown}\n--- END USER STORIES ---`)
        }
      }
      return parts.join('\n\n')
    },
  },
}

export function getAgentConfig(type: CanvasNodeType): AgentConfig {
  return agentConfigs[type]
}

export function buildPromptMessages(
  nodeType: CanvasNodeType,
  userInput: string | undefined,
  upstreamContents: Record<string, { type: CanvasNodeType; markdown: string }>,
) {
  const config = getAgentConfig(nodeType)
  const contextBlock = config.contextBuilder(upstreamContents)

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: config.systemPrompt },
  ]

  let userMessage = ''
  if (contextBlock) {
    userMessage += `Here is the upstream context:\n\n${contextBlock}\n\n`
  }
  if (userInput) {
    userMessage += `User input:\n${userInput}`
  } else if (!contextBlock) {
    userMessage += 'Generate initial content based on the system prompt. Ask the user to provide input by describing what information you need.'
  } else {
    userMessage += 'Based on the upstream context provided, generate your output.'
  }

  messages.push({ role: 'user', content: userMessage })

  return messages
}

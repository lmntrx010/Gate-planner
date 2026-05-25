const rawSyllabus = [
  {
    name: 'Engineering Mathematics',
    difficulty: 'Intermediate',
    weightage: 6,
    topics: [
      'Discrete Mathematics',
      'Propositional and first-order logic',
      'Sets, relations, functions, partial orders and lattices',
      'Monoids, groups',
      'Graphs: connectivity, matching, coloring',
      'Combinatorics: counting, recurrence relations, generating functions',
      'Linear Algebra: Matrices, determinants, systems of linear equations, eigenvalues and eigenvectors, LU decomposition',
      'Calculus: Limits, continuity and differentiability, maxima and minima, mean value theorems, integration',
      'Probability and Statistics: Random variables, Uniform, normal, exponential, poisson and binomial distributions, Mean, median, mode and standard deviation, Conditional probability and Bayes theorem'
    ]
  },
  {
    name: 'Digital Logic',
    difficulty: 'Beginner',
    weightage: 5.5,
    topics: ['Boolean algebra', 'Combinational and sequential circuits', 'Minimization', 'Number representations and computer arithmetic']
  },
  {
    name: 'Computer Organization and Architecture',
    difficulty: 'Advanced',
    weightage: 6.5,
    topics: ['Machine instructions and addressing modes', 'ALU, data-path and control unit', 'Instruction pipelining', 'Pipeline hazards', 'Memory hierarchy', 'I/O interface']
  },
  {
    name: 'Programming and Data Structures',
    difficulty: 'Intermediate',
    weightage: 9,
    topics: ['Programming in C', 'Recursion', 'Arrays, stacks, queues, linked lists, trees, binary search trees, binary heaps, graphs']
  },
  {
    name: 'Algorithms',
    difficulty: 'Advanced',
    weightage: 9,
    topics: ['Searching, sorting, hashing', 'Asymptotic worst case time and space complexity', 'Greedy, dynamic programming and divide-and-conquer', 'Graph traversals, minimum spanning trees, shortest paths']
  },
  {
    name: 'Theory of Computation',
    difficulty: 'Advanced',
    weightage: 8,
    topics: ['Regular expressions and finite automata', 'Context-free grammars and push-down automata', 'Pumping lemma', 'Turing machines and undecidability']
  },
  {
    name: 'Compiler Design',
    difficulty: 'Advanced',
    weightage: 4,
    topics: ['Lexical analysis, parsing, syntax-directed translation', 'Runtime environments', 'Intermediate code generation', 'Local optimization', 'Data flow analysis']
  },
  {
    name: 'Operating System',
    difficulty: 'Intermediate',
    weightage: 8.5,
    topics: ['Processes, threads, IPC, concurrency and synchronization', 'Deadlock', 'CPU and I/O scheduling', 'Memory management and virtual memory', 'File systems']
  },
  {
    name: 'Databases',
    difficulty: 'Intermediate',
    weightage: 7.5,
    topics: ['ER-model', 'Relational model, relational algebra, tuple calculus, SQL', 'Integrity constraints, normal forms', 'File organization and indexing', 'Transactions and concurrency control']
  },
  {
    name: 'Computer Networks',
    difficulty: 'Advanced',
    weightage: 8.5,
    topics: ['OSI and TCP/IP protocol stacks', 'Packet, circuit and virtual circuit switching', 'Data link layer', 'Routing protocols', 'IPv4, CIDR, ARP, DHCP, ICMP, NAT', 'UDP, TCP, sockets', 'DNS, SMTP, HTTP, FTP, Email']
  },
  {
    name: 'General Aptitude',
    difficulty: 'Beginner',
    weightage: 15,
    topics: ['Verbal Ability', 'Quantitative Aptitude', 'Analytical Aptitude', 'Spatial Aptitude']
  }
];

const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export const fallbackCatalog = rawSyllabus.map(subject => ({
  id: slugify(subject.name),
  name: subject.name,
  weightage: subject.weightage,
  difficulty: subject.difficulty,
  topics: subject.topics.map(topic => ({
    id: `${slugify(subject.name)}_${slugify(topic)}`,
    name: topic,
    category: 'Core GATE',
    estimatedHours: topic.length > 70 ? 8 : 6,
    difficulty: subject.difficulty
  }))
}));

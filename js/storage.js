/**
 * 数据存储层 - 管理所有应用数据的持久化
 * 使用 localStorage 实现：实时自动保存、离线可用、数据零丢失
 */
const Store = (function () {
  const STORAGE_KEY = 'efficiency_app_data';
  const BACKUP_KEY = 'efficiency_app_data_backup';
  const RECYCLE_BIN_KEY = 'efficiency_app_recycle_bin';

  const defaultData = {
    tasks: [],
    weeklyGoals: [],
    bills: [],
    inspirations: [],
    milestones: [],
    focusSessions: [],
    stickyNotes: '',
    reviewMemos: {},
    // ===== 补品打卡 =====
    supplements: [], // {id,name,effects,bestTime,frequency,color,reminderEnabled,reminderTime,reminderReason,source,checkins:{日期:[时间戳...]}}
    // ===== 每日阅读 =====
    reading: {
      records: [],   // {id,date,minutes,book,medium,goalMinutes,endedAt}
      books: [],     // {id,name,status:'reading'|'done',progress,addedAt,doneAt}
      quoteDate: '', // 当日金句缓存日期
      quotes: [],    // 当日 3 句 [{text,author,source}]
      favorites: [], // 收藏金句 [{text,author,source}]
      medium: 'paper', // 默认阅读介质 paper/ebook/radio
      streak: { lastDate: '', count: 0, longest: 0 },
      lastReminded: {}, // 提醒去重 {日期:true}
    },
    // ===== 健康生活 =====
    health: {
      sleep: {
        records: {}, // { '2026-07-28': { asleep:时间戳, awake:时间戳 } } 每日一条
        state: { sleeping: false, asleepAt: 0 }, // 当前进行中的睡眠
      },
      period: {
        days: {}, // { '2026-07-28': { symptoms:['痛经'] } } 标记的经期日
        cycleLength: 28, // 周期天数
      },
      bowel: {
        days: {}, // { '2026-07-28': [时间戳,...] } 每日若干次
        lastReminded: '', // 提醒去重日期
      },
      names: { // 全部支持用户自定义修改
        module: '健康生活',
        sleep: { module: '🌙 安睡小窝', sleepBtn: '🌙 我要睡啦', wakeBtn: '☀️ 我醒啦' },
        period: { module: '🌸 小月历' },
        bowel: { module: '💩 今日噗噗', recordBtn: '💩 噗噗' },
      },
      reminders: {
        sleepTime: '23:00', // 睡前提醒时间
        periodReminder: true, // 经期预测提醒总开关
      },
    },
    settings: {
      currentModule: 'todo',
      selectedDate: null,
      todoView: 'dimension',
      reviewView: 'week',
      financeView: 'month',
      themeColor: '#333333',
      archiveDelay: 86400000, // 已完成任务自动归档延迟(ms)：3600000/86400000/604800000/0(手动)
      categories: null, // null=使用默认4维度；数组=自定义分类配置
      installBarDismissed: false,
      timerRingtone: '雷达', // 倒计时归零铃声：雷达/和弦/钟声/叮咚/晨曦/电子/涟漪/轻触/明亮/悠扬/颤音/静音
      weeklyGoalCount: 5, // 用户自主设定的「本周目标」任务数量
      supplementColorIdx: 0, // 莫兰迪色盘轮转指针
      supplementReminder: true, // 补品到时提醒总开关
      dailyQuoteTitle: '每日金句', // 金句模块标题
    },
    meta: {
      lastModified: Date.now(),
      version: '1.6.0',
      seeded: false,
    }
  };

  let data = null;

  function uuid() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  // 深合并：src 覆盖 target，缺失键由 target 补全（用于嵌套对象升级迁移，绝不丢数据）
  function mergeDeep(target, src) {
    if (!src || typeof src !== 'object') return JSON.parse(JSON.stringify(target));
    const out = Array.isArray(target) ? (Array.isArray(src) ? src.slice() : src) : { ...target };
    for (const k in src) {
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && target && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
        out[k] = mergeDeep(target[k], src[k]);
      } else if (src[k] !== undefined) {
        out[k] = src[k];
      }
    }
    return out;
  }
  function mergeArrayKeep(a) { return Array.isArray(a) ? a : []; }

  function init() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        data = JSON.parse(stored);
        data = { ...defaultData, ...data };
        data.settings = { ...defaultData.settings, ...data.settings };
        // 嵌套对象深合并：升级时补齐新增字段，绝不覆盖/清空用户已有子数据（防止更新丢数据）
        data.health = mergeDeep(defaultData.health, data.health);
        data.reading = { ...defaultData.reading, ...(data.reading || {}), records: mergeArrayKeep(data.reading && data.reading.records, defaultData.reading.records), books: mergeArrayKeep(data.reading && data.reading.books, defaultData.reading.books) };
        // 数据迁移：已有业务数据的用户标记为已播种，避免 clearAll 后重新播种演示数据
        if ((data.tasks && data.tasks.length) || (data.bills && data.bills.length)) {
          data.meta.seeded = true;
        }
      } catch (e) {
        const backup = localStorage.getItem(BACKUP_KEY);
        if (backup) {
          data = JSON.parse(backup);
        } else {
          data = JSON.parse(JSON.stringify(defaultData));
        }
      }
    } else {
      data = JSON.parse(JSON.stringify(defaultData));
    }
    if (!data.settings.selectedDate) {
      data.settings.selectedDate = formatDate(new Date());
    }
    save();
    Tasks.autoArchive();
  }

  function save() {
    data.meta.lastModified = Date.now();
    const json = JSON.stringify(data);
    try {
      localStorage.setItem(STORAGE_KEY, json);
      localStorage.setItem(BACKUP_KEY, json);
    } catch (e) {
      console.error('保存失败', e);
      try {
        const core = { ...data, stickyNotes: '' };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(core));
      } catch (e2) {
        console.error('备份保存也失败', e2);
      }
    }
  }

  function formatDate(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function getMonthKey(year, month) {
    return `${year}-${String(month + 1).padStart(2, '0')}`;
  }

  function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getWeekKey(date) {
    const monday = getMonday(date);
    const y = monday.getFullYear();
    const jan1 = new Date(y, 0, 1);
    const weekNum = Math.ceil(((monday - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    return `${y}-W${String(weekNum).padStart(2, '0')}`;
  }

  const DateUtils = {
    formatDate,
    getMonday,
    getWeekKey,
    getMonthKey,
    getWeekRange(date) {
      const monday = getMonday(date);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return `${monday.getMonth() + 1}/${monday.getDate()}-${sunday.getMonth() + 1}/${sunday.getDate()}`;
    },
    getWeekDates(date) {
      const monday = getMonday(date);
      const dates = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(d.getDate() + i);
        dates.push(d);
      }
      return dates;
    },
    getMonthDays(year, month) {
      return new Date(year, month + 1, 0).getDate();
    },
    isSameDay(d1, d2) {
      return formatDate(d1) === formatDate(d2);
    },
    isToday(date) {
      return formatDate(new Date()) === formatDate(date);
    },
    addDays(date, days) {
      const d = new Date(date);
      d.setDate(d.getDate() + days);
      return d;
    },
    getWeekday(date) {
      return new Date(date).getDay();
    },
    weekdayCN(date) {
      const map = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      return map[new Date(date).getDay()];
    },
    weekdayShort(date) {
      const map = ['日', '一', '二', '三', '四', '五', '六'];
      return map[new Date(date).getDay()];
    },
    getYearKey(date) {
      return String(new Date(date).getFullYear());
    },
  };

  const Tasks = {
    getAll() { return data.tasks; },
    getByDate(date) {
      const dateStr = formatDate(date);
      return data.tasks
        .filter(t => t.date === dateStr && !t.isArchived)
        .sort((a, b) => {
          if (a.completed !== b.completed) return a.completed ? 1 : -1;
          if (!a.completed) return a.createdAt - b.createdAt;
          return (b.completedAt || 0) - (a.completedAt || 0);
        });
    },
    getByDateRange(startDate, endDate) {
      const s = formatDate(startDate);
      const e = formatDate(endDate);
      return data.tasks.filter(t => t.date >= s && t.date <= e);
    },
    getByDimension(date, dimension) {
      return this.getByDate(date).filter(t => t.dimension === dimension);
    },
    getByWeek(date) {
      const weekDates = DateUtils.getWeekDates(date);
      const start = formatDate(weekDates[0]);
      const end = formatDate(weekDates[6]);
      return data.tasks.filter(t => t.date >= start && t.date <= end);
    },
    getByMonth(year, month) {
      const prefix = getMonthKey(year, month);
      return data.tasks.filter(t => t.date.startsWith(prefix));
    },
    getByYear(year) {
      return data.tasks.filter(t => t.date.startsWith(String(year)));
    },
    getById(id) {
      return data.tasks.find(t => t.id === id);
    },
    create(taskData) {
      const task = {
        id: uuid(),
        name: taskData.name,
        notes: taskData.notes || '',
        dimension: taskData.dimension || 'work',
        date: taskData.date || formatDate(new Date()),
        time: taskData.time || '',
        completed: false,
        completedAt: null,
        createdAt: Date.now(),
        weeklyGoalId: taskData.weeklyGoalId || null,
        isMultiDay: taskData.isMultiDay || false,
        startDate: taskData.startDate || null,
        endDate: taskData.endDate || null,
        isArchived: false,
        focusMinutes: 0,
      };
      data.tasks.push(task);
      save();
      return task;
    },
    createMultiDay(taskData) {
      const tasks = [];
      if (!taskData.startDate || !taskData.endDate) return tasks;
      const start = new Date(taskData.startDate);
      const end = new Date(taskData.endDate);
      const cur = new Date(start);
      while (cur <= end) {
        tasks.push(this.create({
          ...taskData,
          date: formatDate(cur),
          isMultiDay: true,
          startDate: formatDate(start),
          endDate: formatDate(end),
        }));
        cur.setDate(cur.getDate() + 1);
      }
      return tasks;
    },
    update(id, updates) {
      const task = this.getById(id);
      if (!task) return null;
      Object.assign(task, updates);
      save();
      return task;
    },
    toggleComplete(id) {
      const task = this.getById(id);
      if (!task) return null;
      task.completed = !task.completed;
      task.completedAt = task.completed ? Date.now() : null;
      save();
      return task;
    },
    delete(id) {
      const idx = data.tasks.findIndex(t => t.id === id);
      if (idx === -1) return false;
      moveToRecycleBin('task', data.tasks[idx]);
      data.tasks.splice(idx, 1);
      save();
      return true;
    },
    getCountByDate(date) {
      const dateStr = formatDate(date);
      return data.tasks.filter(t => t.date === dateStr).length;
    },
    getCompletedCountByDate(date) {
      const dateStr = formatDate(date);
      return data.tasks.filter(t => t.date === dateStr && t.completed).length;
    },
    search(query) {
      const q = query.toLowerCase();
      return data.tasks.filter(t =>
        t.name.toLowerCase().includes(q) ||
        (t.notes && t.notes.toLowerCase().includes(q))
      );
    },
    // ===== 归档系统 =====
    // 活跃视图(按日期)默认排除已归档任务，减少日常干扰
    getActiveByDate(date) {
      return this.getByDate(date).filter(t => !t.isArchived);
    },
    getArchived() {
      return data.tasks
        .filter(t => t.isArchived)
        .sort((a, b) => (b.completedAt || b.createdAt) - (a.completedAt || a.createdAt));
    },
    archive(id) {
      const task = this.getById(id);
      if (!task) return false;
      task.isArchived = true;
      save();
      return true;
    },
    restore(id) {
      const task = this.getById(id);
      if (!task) return false;
      task.isArchived = false;
      save();
      return true;
    },
    // 永久删除（不进回收站）
    removePermanently(id) {
      const idx = data.tasks.findIndex(t => t.id === id);
      if (idx === -1) return false;
      data.tasks.splice(idx, 1);
      save();
      return true;
    },
    // 根据 settings.archiveDelay 自动归档已完成且超过延迟的任务
    // archiveDelay=0 表示仅手动归档
    autoArchive() {
      const delay = (data.settings && data.settings.archiveDelay) || 0;
      if (!delay) return 0;
      const now = Date.now();
      let count = 0;
      data.tasks.forEach(t => {
        if (t.completed && !t.isArchived && t.completedAt && (now - t.completedAt) >= delay) {
          t.isArchived = true;
          count++;
        }
      });
      if (count) save();
      return count;
    },
    // 累加任务专注时长(分钟)
    addFocusMinutes(id, minutes) {
      const task = this.getById(id);
      if (!task || !minutes) return;
      task.focusMinutes = (task.focusMinutes || 0) + minutes;
      save();
    },
  };

  const WeeklyGoals = {
    getAll() { return data.weeklyGoals; },
    getByWeek(date) {
      const weekKey = getWeekKey(date);
      return data.weeklyGoals.filter(g => g.weekKey === weekKey);
    },
    getById(id) {
      return data.weeklyGoals.find(g => g.id === id);
    },
    create(goalData) {
      const goal = {
        id: uuid(),
        name: goalData.name,
        dimension: goalData.dimension || 'work',
        weekKey: goalData.weekKey || getWeekKey(new Date()),
        taskIds: goalData.taskIds || [],
        createdAt: Date.now(),
      };
      data.weeklyGoals.push(goal);
      save();
      return goal;
    },
    update(id, updates) {
      const goal = this.getById(id);
      if (!goal) return null;
      Object.assign(goal, updates);
      save();
      return goal;
    },
    delete(id) {
      const idx = data.weeklyGoals.findIndex(g => g.id === id);
      if (idx === -1) return false;
      moveToRecycleBin('weeklyGoal', data.weeklyGoals[idx]);
      data.weeklyGoals.splice(idx, 1);
      save();
      return true;
    },
    linkTask(goalId, taskId) {
      const goal = this.getById(goalId);
      if (goal && !goal.taskIds.includes(taskId)) {
        goal.taskIds.push(taskId);
        const task = Tasks.getById(taskId);
        if (task) task.weeklyGoalId = goalId;
        save();
      }
    },
    getProgress(goalId) {
      const goal = this.getById(goalId);
      if (!goal) return { completed: 0, total: 0, percent: 0 };
      const tasks = goal.taskIds.map(id => Tasks.getById(id)).filter(Boolean);
      const completed = tasks.filter(t => t.completed).length;
      const total = tasks.length;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
      return { completed, total, percent };
    },
  };

  const Bills = {
    getAll() { return data.bills; },
    getByDate(date) {
      const dateStr = formatDate(date);
      return data.bills
        .filter(b => b.date === dateStr)
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    getByDateRange(startDate, endDate) {
      const s = formatDate(startDate);
      const e = formatDate(endDate);
      return data.bills.filter(b => b.date >= s && b.date <= e);
    },
    getByWeek(date) {
      const weekDates = DateUtils.getWeekDates(date);
      return this.getByDateRange(weekDates[0], weekDates[6]);
    },
    getByMonth(year, month) {
      const prefix = getMonthKey(year, month);
      return data.bills.filter(b => b.date.startsWith(prefix));
    },
    getByYear(year) {
      return data.bills.filter(b => b.date.startsWith(String(year)));
    },
    getById(id) {
      return data.bills.find(b => b.id === id);
    },
    create(billData) {
      const bill = {
        id: uuid(),
        type: billData.type || 'expense',
        category: billData.category || 'food',
        amount: parseFloat(billData.amount),
        date: billData.date || formatDate(new Date()),
        note: billData.note || '',
        createdAt: Date.now(),
      };
      data.bills.push(bill);
      save();
      return bill;
    },
    update(id, updates) {
      const bill = this.getById(id);
      if (!bill) return null;
      Object.assign(bill, updates);
      if (updates.amount !== undefined) bill.amount = parseFloat(updates.amount);
      save();
      return bill;
    },
    delete(id) {
      const idx = data.bills.findIndex(b => b.id === id);
      if (idx === -1) return false;
      moveToRecycleBin('bill', data.bills[idx]);
      data.bills.splice(idx, 1);
      save();
      return true;
    },
    getExpenseByDate(date) {
      const dateStr = formatDate(date);
      return data.bills
        .filter(b => b.date === dateStr && b.type === 'expense')
        .reduce((sum, b) => sum + b.amount, 0);
    },
    getStats(bills) {
      const expenses = bills.filter(b => b.type === 'expense');
      const incomes = bills.filter(b => b.type === 'income');
      const totalExpense = expenses.reduce((s, b) => s + b.amount, 0);
      const totalIncome = incomes.reduce((s, b) => s + b.amount, 0);
      const byCategory = { food: 0, shopping: 0, transport: 0 };
      expenses.forEach(b => {
        if (byCategory.hasOwnProperty(b.category)) {
          byCategory[b.category] += b.amount;
        }
      });
      return {
        totalExpense,
        totalIncome,
        balance: totalIncome - totalExpense,
        count: bills.length,
        byCategory,
      };
    },
    search(query) {
      const q = query.toLowerCase();
      return data.bills.filter(b =>
        (b.note && b.note.toLowerCase().includes(q)) ||
        b.category.toLowerCase().includes(q)
      );
    },
  };

  const Inspirations = {
    getAll() { return data.inspirations; },
    getByDate(date) {
      const dateStr = formatDate(date);
      return data.inspirations
        .filter(i => i.date === dateStr)
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    create(inspData) {
      const insp = {
        id: uuid(),
        content: inspData.content,
        type: inspData.type || 'idea',
        date: formatDate(new Date()),
        createdAt: Date.now(),
      };
      data.inspirations.push(insp);
      save();
      return insp;
    },
    delete(id) {
      const idx = data.inspirations.findIndex(i => i.id === id);
      if (idx === -1) return false;
      moveToRecycleBin('inspiration', data.inspirations[idx]);
      data.inspirations.splice(idx, 1);
      save();
      return true;
    },
    search(query) {
      const q = query.toLowerCase();
      return data.inspirations.filter(i => i.content.toLowerCase().includes(q));
    },
  };

  const Milestones = {
    getAll() { return data.milestones; },
    getByDate(date) {
      const dateStr = formatDate(date);
      return data.milestones.filter(m => m.date === dateStr);
    },
    getByMonth(year, month) {
      const prefix = getMonthKey(year, month);
      return data.milestones.filter(m => m.date.startsWith(prefix));
    },
    create(mData) {
      const milestone = {
        id: uuid(),
        date: mData.date || formatDate(new Date()),
        content: mData.content,
        createdAt: Date.now(),
      };
      data.milestones.push(milestone);
      save();
      return milestone;
    },
    delete(id) {
      const idx = data.milestones.findIndex(m => m.id === id);
      if (idx === -1) return false;
      data.milestones.splice(idx, 1);
      save();
      return true;
    },
  };

  // ===== 专注计时记录 =====
  const FocusSessions = {
    getAll() { return data.focusSessions; },
    getByDate(date) {
      const dateStr = formatDate(date);
      return data.focusSessions
        .filter(s => s.date === dateStr)
        .sort((a, b) => b.startedAt - a.startedAt);
    },
    getByDateRange(startDate, endDate) {
      const s = formatDate(startDate);
      const e = formatDate(endDate);
      return data.focusSessions
        .filter(x => x.date >= s && x.date <= e)
        .sort((a, b) => b.startedAt - a.startedAt);
    },
    getByTask(taskId) {
      return data.focusSessions.filter(s => s.taskId === taskId);
    },
    create(session) {
      const s = {
        id: uuid(),
        taskId: session.taskId || null,
        taskName: session.taskName || '',
        mode: session.mode || 'countup', // countup(正计时) | countdown(倒计时)
        plannedMinutes: session.plannedMinutes || 0,
        minutes: session.minutes || 0,
        date: session.date || formatDate(new Date()),
        startedAt: session.startedAt || Date.now(),
        endedAt: session.endedAt || Date.now(),
        note: session.note || '',
      };
      data.focusSessions.push(s);
      save();
      return s;
    },
    delete(id) {
      const idx = data.focusSessions.findIndex(s => s.id === id);
      if (idx === -1) return false;
      data.focusSessions.splice(idx, 1);
      save();
      return true;
    },
    getStatsByDateRange(startDate, endDate) {
      const list = this.getByDateRange(startDate, endDate);
      const total = list.reduce((sum, s) => sum + (s.minutes || 0), 0);
      return { count: list.length, totalMinutes: total };
    },
  };

  const ReviewMemos = {
    get(periodKey) {
      return data.reviewMemos[periodKey] || '';
    },
    set(periodKey, content) {
      data.reviewMemos[periodKey] = content;
      save();
    },
    getByWeek(date) {
      return this.get('week_' + getWeekKey(date));
    },
    setByWeek(date, content) {
      this.set('week_' + getWeekKey(date), content);
    },
    getByMonth(year, month) {
      return this.get('month_' + getMonthKey(year, month));
    },
    setByMonth(year, month, content) {
      this.set('month_' + getMonthKey(year, month), content);
    },
    getByYear(year) {
      return this.get('year_' + year);
    },
    setByYear(year, content) {
      this.set('year_' + year, content);
    },
  };

  const StickyNotes = {
    get() { return data.stickyNotes || ''; },
    set(content) {
      data.stickyNotes = content;
      save();
    },
  };

  const Settings = {
    get() { return data.settings; },
    update(updates) {
      Object.assign(data.settings, updates);
      save();
    },
    getSelectedDate() {
      return data.settings.selectedDate || formatDate(new Date());
    },
    setSelectedDate(date) {
      data.settings.selectedDate = formatDate(date);
      save();
    },
  };

  function moveToRecycleBin(type, item) {
    let bin = [];
    try {
      bin = JSON.parse(localStorage.getItem(RECYCLE_BIN_KEY) || '[]');
    } catch (e) { bin = []; }
    bin.push({
      type,
      data: item,
      deletedAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
    bin = bin.filter(b => b.expiresAt > Date.now());
    try {
      localStorage.setItem(RECYCLE_BIN_KEY, JSON.stringify(bin));
    } catch (e) {
      console.error('回收站写入失败', e);
    }
  }

  const RecycleBin = {
    getAll() {
      try {
        const bin = JSON.parse(localStorage.getItem(RECYCLE_BIN_KEY) || '[]');
        return bin.filter(b => b.expiresAt > Date.now());
      } catch (e) {
        return [];
      }
    },
    restore(id) {
      const bin = this.getAll();
      const item = bin.find(b => b.data.id === id);
      if (!item) return false;
      if (item.type === 'task') data.tasks.push(item.data);
      else if (item.type === 'bill') data.bills.push(item.data);
      else if (item.type === 'weeklyGoal') data.weeklyGoals.push(item.data);
      else if (item.type === 'inspiration') data.inspirations.push(item.data);
      save();
      const filtered = bin.filter(b => b.data.id !== id);
      localStorage.setItem(RECYCLE_BIN_KEY, JSON.stringify(filtered));
      return true;
    },
    clear() {
      localStorage.setItem(RECYCLE_BIN_KEY, '[]');
    },
  };

  // ===== 补品打卡 =====
  const MORANDI_PALETTE = ['#D4A0A0', '#A0B8A0', '#A8B5C8', '#D4B89B', '#C2A8C2', '#9EB0B0', '#D0A8A8', '#B0B8A0'];
  const Supplements = {
    getAll() { return data.supplements; },
    getById(id) { return data.supplements.find(s => s.id === id); },
    nextColor() {
      const idx = (data.settings.supplementColorIdx || 0) % MORANDI_PALETTE.length;
      data.settings.supplementColorIdx = idx + 1;
      save();
      return MORANDI_PALETTE[idx];
    },
    create(supData) {
      const sup = {
        id: uuid(),
        name: supData.name,
        effects: supData.effects || '请遵医嘱',
        bestTime: supData.bestTime || '餐后',
        frequency: supData.frequency || 1,
        color: supData.color || this.nextColor(),
        reminderEnabled: !!supData.reminderEnabled,
        reminderTime: supData.reminderTime || '',
        reminderReason: supData.reminderReason || '',
        source: supData.source || 'manual', // auto=AI解析 manual=手动
        editable: supData.editable !== false, // 冷门中药降级后允许手动编辑
        checkins: {}, // { '2026-07-28': [timestamp,...] } 每日打卡时间戳数组
        createdAt: Date.now(),
      };
      data.supplements.push(sup);
      save();
      return sup;
    },
    update(id, updates) {
      const sup = this.getById(id);
      if (!sup) return null;
      Object.assign(sup, updates);
      save();
      return sup;
    },
    delete(id) {
      const idx = data.supplements.findIndex(s => s.id === id);
      if (idx === -1) return false;
      data.supplements.splice(idx, 1);
      save();
      return true;
    },
    // 打卡 / 取消（dot 点击逻辑）：filled = checkins[date].length
    // 点击第 i 个圆点：i<filled 撤销到 i；i===filled 且未满则 +1；其余忽略
    tapDot(id, index, dateStr) {
      const sup = this.getById(id);
      if (!sup) return;
      const arr = sup.checkins[dateStr] || [];
      const filled = arr.length;
      if (index < filled) {
        sup.checkins[dateStr] = arr.slice(0, index); // 撤销该位及之后
      } else if (index === filled && filled < sup.frequency) {
        sup.checkins[dateStr] = arr.concat([Date.now()]);
      } else {
        return;
      }
      if (sup.checkins[dateStr].length === 0) delete sup.checkins[dateStr];
      save();
    },
    getFilled(id, dateStr) {
      const sup = this.getById(id);
      if (!sup || !sup.checkins[dateStr]) return 0;
      return Math.min(sup.checkins[dateStr].length, sup.frequency);
    },
    isDoneToday(id, dateStr) {
      const sup = this.getById(id);
      if (!sup) return false;
      return this.getFilled(id, dateStr) >= sup.frequency;
    },
    // 模块今日完成度 {done,total}：done 为已吃剂量(封顶频次)，total 为频次之和
    getTodayProgress(dateStr) {
      let done = 0, total = 0;
      data.supplements.forEach(s => {
        total += s.frequency || 1;
        done += Math.min(this.getFilled(s.id, dateStr), s.frequency || 1);
      });
      return { done, total };
    },
    // 日历某天：返回 [ {color, name, times:[..]} ] 供彩点渲染
    getDayRecords(dateStr) {
      return data.supplements
        .filter(s => s.checkins && s.checkins[dateStr] && s.checkins[dateStr].length)
        .map(s => ({ color: s.color, name: s.name, times: s.checkins[dateStr].slice() }));
    },
    // 某天达标（全部补品吃完）？
    isAllDone(dateStr) {
      if (!data.supplements.length) return false;
      return data.supplements.every(s => this.isDoneToday(s.id, dateStr));
    },
    // 排名统计：返回 [{name,color,count}] 按某日期范围内打卡总次数降序
    getRanking(startDate, endDate) {
      const s = formatDate(startDate), e = formatDate(endDate);
      const rank = {};
      data.supplements.forEach(sup => {
        let c = 0;
        Object.keys(sup.checkins || {}).forEach(d => {
          if (d >= s && d <= e) c += sup.checkins[d].length;
        });
        if (c > 0) rank[sup.id] = { name: sup.name, color: sup.color, count: c };
      });
      return Object.values(rank).sort((a, b) => b.count - a.count);
    },
  };

  // ===== 健康生活 =====
  const Health = {
    // ---------- 命名自定义 ----------
    getNames() { return data.health.names; },
    setHealthName(group, key, val) {
      const g = data.health.names[group] || (data.health.names[group] = {});
      g[key] = val; save();
    },
    setModuleName(val) { data.health.names.module = val; save(); },
    // ---------- 睡眠 ----------
    getSleep() { return data.health.sleep; },
    getSleepState() { return data.health.sleep.state; },
    isSleeping() { return !!data.health.sleep.state.sleeping; },
    startSleep() {
      if (data.health.sleep.state.sleeping) return false;
      data.health.sleep.state = { sleeping: true, asleepAt: Date.now() };
      save();
      return true;
    },
    wakeUp() {
      const st = data.health.sleep.state;
      if (!st.sleeping) return null;
      const asleepAt = st.asleepAt, awake = Date.now();
      const durMin = Math.max(0, Math.round((awake - asleepAt) / 60000));
      const today = formatDate(new Date());
      data.health.sleep.records[today] = { asleep: asleepAt, awake };
      data.health.sleep.state = { sleeping: false, asleepAt: 0 };
      save();
      return { durMin, asleepAt, awake, dateStr: today };
    },
    getSleepRecord(dateStr) { return data.health.sleep.records[dateStr] || null; },
    getSleepMinutes(dateStr) {
      const r = data.health.sleep.records[dateStr];
      if (!r || !r.asleep || !r.awake) return null;
      return Math.max(0, Math.round((r.awake - r.asleep) / 60000));
    },
    getWeekSleep() {
      const dates = DateUtils.getWeekDates(new Date());
      return dates.map(d => {
        const ds = formatDate(d);
        return { date: ds, min: this.getSleepMinutes(ds), label: DateUtils.weekdayShort(d) };
      });
    },
    getMonthSleep(year, month) {
      const days = DateUtils.getMonthDays(year, month);
      const map = {};
      for (let i = 1; i <= days; i++) {
        const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        map[i] = this.getSleepMinutes(ds);
      }
      return map;
    },
    sleepSuggestion(dateStr) {
      const min = this.getSleepMinutes(dateStr);
      if (min == null) return { level: 'none', text: '🌙 今晚早点休息，点击「我要睡啦」记录睡眠吧～' };
      const h = min / 60;
      if (h >= 7 && h <= 9) return { level: 'good', text: '🌟 太棒了！睡眠时长达标，今天精力一定很充沛！' };
      if (h < 7) {
        const diff = (7 - h).toFixed(1);
        return { level: 'low', text: `💛 今天只睡了${h.toFixed(1)}小时，建议今晚早点休息哦，还差${diff}小时就达标啦～` };
      }
      return { level: 'high', text: '😴 今天睡得有点多哦，适当运动一下会更精神！' };
    },
    napSuggestion() {
      const h = new Date().getHours();
      if (h >= 13 && h <= 16) return '🌤️ 下午啦，如果觉得困，可以小憩15-20分钟哦～';
      return '';
    },
    // ---------- 经期 ----------
    getPeriod() { return data.health.period; },
    isPeriodDay(dateStr) { return !!data.health.period.days[dateStr]; },
    getSymptoms(dateStr) { return (data.health.period.days[dateStr] && data.health.period.days[dateStr].symptoms) || []; },
    togglePeriod(dateStr, symptoms) {
      if (data.health.period.days[dateStr]) delete data.health.period.days[dateStr];
      else data.health.period.days[dateStr] = { symptoms: symptoms || [] };
      save();
      return !!data.health.period.days[dateStr];
    },
    setCycleLength(n) {
      n = Math.max(20, Math.min(45, parseInt(n) || 28));
      data.health.period.cycleLength = n; save();
    },
    getPeriodDaysInMonth(year, month) {
      const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
      return Object.keys(data.health.period.days)
        .filter(d => d.startsWith(prefix))
        .map(d => parseInt(d.slice(-2), 10))
        .sort((a, b) => a - b);
    },
    getLastPeriodStart() {
      const days = Object.keys(data.health.period.days).sort();
      if (!days.length) return null;
      const today = formatDate(new Date());
      const past = days.filter(d => d <= today);
      return past.length ? past[past.length - 1] : days[days.length - 1];
    },
    predict() {
      const last = this.getLastPeriodStart();
      const cycle = data.health.period.cycleLength || 28;
      if (!last) return null;
      const lastD = new Date(last + 'T00:00:00');
      const next = new Date(lastD); next.setDate(next.getDate() + cycle);
      const ovu = new Date(lastD); ovu.setDate(ovu.getDate() + cycle - 14);
      const today = new Date();
      const daysUntilNext = Math.round((next - today) / 86400000);
      return {
        nextStart: formatDate(next),
        ovulation: formatDate(ovu),
        daysUntilNext,
        cycle,
      };
    },
    getYearPeriodMap(year) {
      const map = {};
      for (let m = 0; m < 12; m++) map[m] = this.getPeriodDaysInMonth(year, m);
      return map;
    },
    // ---------- 排便 ----------
    getBowel() { return data.health.bowel; },
    recordBowel() {
      const t = formatDate(new Date());
      if (!data.health.bowel.days[t]) data.health.bowel.days[t] = [];
      data.health.bowel.days[t].push(Date.now());
      const cnt = data.health.bowel.days[t].length;
      save();
      return cnt;
    },
    recordBowelOn(dateStr) {
      if (!data.health.bowel.days[dateStr]) data.health.bowel.days[dateStr] = [];
      data.health.bowel.days[dateStr].push(Date.now());
      const cnt = data.health.bowel.days[dateStr].length;
      save();
      return cnt;
    },
    getTodayBowelCount() {
      const t = formatDate(new Date());
      return (data.health.bowel.days[t] && data.health.bowel.days[t].length) || 0;
    },
    getBowelCount(dateStr) {
      return (data.health.bowel.days[dateStr] && data.health.bowel.days[dateStr].length) || 0;
    },
    getBowelDaysInMonth(year, month) {
      const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
      const map = {};
      Object.keys(data.health.bowel.days).filter(d => d.startsWith(prefix)).forEach(d => {
        map[parseInt(d.slice(-2), 10)] = data.health.bowel.days[d].length;
      });
      return map;
    },
    getMonthBowelStats(year, month) {
      const m = this.getBowelDaysInMonth(year, month);
      const dayCount = Object.keys(m).length;
      const total = Object.values(m).reduce((s, x) => s + x, 0);
      return { total, dayCount, avg: dayCount ? (total / dayCount) : 0 };
    },
    needsBowelReminder() {
      const t = formatDate(new Date());
      const y = formatDate(new Date(Date.now() - 86400000));
      if (data.health.bowel.lastReminded === t) return false;
      const todayCnt = this.getBowelCount(t);
      const yCnt = this.getBowelCount(y);
      if (todayCnt === 0 && yCnt === 0) {
        data.health.bowel.lastReminded = t; save();
        return true;
      }
      return false;
    },
    // ---------- 跨模块当日汇总 ----------
    getDaySummary(dateStr) {
      const sleepMin = this.getSleepMinutes(dateStr);
      const isPeriod = this.isPeriodDay(dateStr);
      const bowel = this.getBowelCount(dateStr);
      const sp = Store.Supplements.getTodayProgress(dateStr);
      const readToday = Store.Reading.get().records.filter(r => r.date === dateStr).reduce((s, x) => s + (x.minutes || 0), 0);
      return { sleepMin, isPeriod, bowel, supplement: sp, readMin: readToday };
    },
  };

  // ===== 每日阅读 =====
  const Reading = {
    get() { return data.reading; },
    ensure() {
      if (!data.reading) data.reading = { records: [], books: [], quoteDate: '', quotes: [], favorites: [], medium: 'paper', streak: { lastDate: '', count: 0, longest: 0 }, lastReminded: {} };
      const r = data.reading;
      r.records = r.records || []; r.books = r.books || []; r.quotes = r.quotes || [];
      r.favorites = r.favorites || []; r.streak = r.streak || { lastDate: '', count: 0, longest: 0 };
      r.lastReminded = r.lastReminded || {};
      return r;
    },
    addRecord(rec) {
      const r = this.ensure();
      const record = {
        id: uuid(),
        date: rec.date || formatDate(new Date()),
        minutes: Math.round(rec.minutes || 0),
        book: rec.book || '',
        medium: rec.medium || r.medium || 'paper',
        goalMinutes: rec.goalMinutes || 0,
        endedAt: Date.now(),
      };
      r.records.push(record);
      this.recomputeStreak();
      save();
      return record;
    },
    getStats() {
      const r = this.ensure();
      const totalMinutes = r.records.reduce((s, x) => s + (x.minutes || 0), 0);
      const booksDone = r.books.filter(b => b.status === 'done').length;
      return { totalMinutes, booksDone, sessionCount: r.records.length };
    },
    // 当前连续天数（以今日/昨日为锚点，按不同日期去重）
    recomputeStreak() {
      const r = this.ensure();
      const dates = Array.from(new Set(r.records.filter(x => (x.minutes || 0) >= 1).map(x => x.date))).sort();
      if (!dates.length) { r.streak = { lastDate: '', count: 0, longest: r.streak.longest || 0 }; save(); return; }
      let longest = r.streak.longest || 0;
      const todayStr = formatDate(new Date());
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const yStr = formatDate(yesterday);
      // 仅当最近记录是今天或昨天才延续；否则连续中断归零
      let count = 0;
      const last = dates[dates.length - 1];
      if (last === todayStr || last === yStr) {
        count = 1;
        for (let i = dates.length - 2; i >= 0; i--) {
          const cur = new Date(dates[i]);
          const prev = new Date(dates[i + 1]);
          const diff = Math.round((prev - cur) / 86400000);
          if (diff === 1) count++; else break;
        }
      }
      longest = Math.max(longest, count);
      r.streak = { lastDate: last, count, longest };
      save();
    },
    getStreak() { this.ensure(); return data.reading.streak; },
    // 今日是否已打卡（>=1 分钟）
    isCheckedToday() {
      const t = formatDate(new Date());
      return this.ensure().records.some(x => x.date === t && (x.minutes || 0) >= 1);
    },
    addBook(name) {
      const r = this.ensure();
      const book = { id: uuid(), name, status: 'reading', progress: 0, addedAt: Date.now(), doneAt: null };
      r.books.push(book);
      save();
      return book;
    },
    markBookDone(id) {
      const r = this.ensure();
      const b = r.books.find(x => x.id === id);
      if (!b) return null;
      b.status = 'done'; b.progress = 100; b.doneAt = Date.now();
      save();
      return b;
    },
    setBookProgress(id, pct) {
      const r = this.ensure();
      const b = r.books.find(x => x.id === id);
      if (!b) return;
      b.progress = Math.max(0, Math.min(100, pct));
      save();
    },
    deleteBook(id) {
      const r = this.ensure();
      const i = r.books.findIndex(x => x.id === id);
      if (i >= 0) { r.books.splice(i, 1); save(); }
    },
    setMedium(m) { this.ensure().medium = m; save(); },
    // 每日金句：当天缓存命中则返回，否则从知识库随机抽 3 句（按日期稳定）
    getDailyQuotes(kb) {
      const r = this.ensure();
      const today = formatDate(new Date());
      if (r.quoteDate === today && r.quotes && r.quotes.length) return r.quotes;
      // 用日期做种子随机，保证当天内稳定、跨天刷新
      let seed = 0; for (let i = 0; i < today.length; i++) seed = (seed * 31 + today.charCodeAt(i)) >>> 0;
      const pool = (kb && kb.length) ? kb.slice() : [];
      const picked = [];
      const n = Math.min(3, pool.length);
      for (let i = 0; i < n; i++) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        const idx = seed % pool.length;
        picked.push(pool.splice(idx, 1)[0]);
      }
      r.quotes = picked; r.quoteDate = today;
      save();
      return picked;
    },
    isFavorite(q) {
      const r = this.ensure();
      return r.favorites.some(f => f.text === q.text && f.author === q.author);
    },
    toggleFavorite(q) {
      const r = this.ensure();
      const i = r.favorites.findIndex(f => f.text === q.text && f.author === q.author);
      if (i >= 0) r.favorites.splice(i, 1);
      else r.favorites.push(q);
      save();
      return i < 0;
    },
    getFavorites() { return this.ensure().favorites; },
    // 今日提醒去重
    isRemindedToday() { return !!this.ensure().lastReminded[formatDate(new Date())]; },
    markRemindedToday() { this.ensure().lastReminded[formatDate(new Date())] = true; save(); },
  };

  // 合并导入：按 id 去重，导入数据覆盖同 id 现有数据
  function mergeData(imported) {
    const mergeArray = (existing, incoming) => {
      const map = new Map();
      (existing || []).forEach(it => { if (it && it.id) map.set(it.id, it); });
      (incoming || []).forEach(it => { if (it && it.id) map.set(it.id, it); });
      return Array.from(map.values());
    };
    if (imported.tasks) data.tasks = mergeArray(data.tasks, imported.tasks);
    if (imported.weeklyGoals) data.weeklyGoals = mergeArray(data.weeklyGoals, imported.weeklyGoals);
    if (imported.bills) data.bills = mergeArray(data.bills, imported.bills);
    if (imported.inspirations) data.inspirations = mergeArray(data.inspirations, imported.inspirations);
    if (imported.milestones) data.milestones = mergeArray(data.milestones, imported.milestones);
    if (imported.focusSessions) data.focusSessions = mergeArray(data.focusSessions, imported.focusSessions);
    if (imported.supplements) data.supplements = mergeArray(data.supplements, imported.supplements);
    if (imported.reading) {
      data.reading = data.reading || { records: [], books: [], quotes: [], favorites: [], streak: {}, lastReminded: {} };
      data.reading.records = mergeArray(data.reading.records, imported.reading.records);
      data.reading.books = mergeArray(data.reading.books, imported.reading.books);
      if (imported.reading.favorites) data.reading.favorites = imported.reading.favorites;
      if (imported.reading.quotes) data.reading.quotes = imported.reading.quotes;
    }
    if (imported.health) data.health = mergeDeep(data.health, imported.health);
    if (imported.reviewMemos) data.reviewMemos = { ...data.reviewMemos, ...imported.reviewMemos };
    if (imported.stickyNotes && !data.stickyNotes) data.stickyNotes = imported.stickyNotes;
    if (imported.settings) data.settings = { ...data.settings, ...imported.settings };
    data.meta = { ...data.meta, ...(imported.meta || {}), lastModified: Date.now() };
  }

  const IO = {
    export() {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `efficiency_backup_${formatDate(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    import(jsonString, mode) {
      try {
        const imported = JSON.parse(jsonString);
        if (mode === 'merge') {
          mergeData(imported);
        } else {
          data = { ...defaultData, ...imported };
          data.settings = { ...defaultData.settings, ...imported.settings };
        }
        save();
        return true;
      } catch (e) {
        console.error('导入失败', e);
        return false;
      }
    },
    clearAll() {
      data = JSON.parse(JSON.stringify(defaultData));
      data.settings.selectedDate = formatDate(new Date());
      data.meta.seeded = true; // 标记已播种，阻止刷新后重新生成演示数据
      save();
      localStorage.removeItem(RECYCLE_BIN_KEY);
      try { sessionStorage.clear(); } catch (e) {}
    },
  };

  // ===== 演示数据 =====
  function seedDemoData() {
    // 仅在从未播种过的全新环境执行；clearAll 后 seeded=true，永不重新播种
    if (data.meta.seeded) return;
    data.meta.seeded = true;

    const today = formatDate(new Date());
    const monday = getMonday(new Date());
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      weekDates.push(formatDate(d));
    }

    // 任务 - 今天的任务
    const todayTasks = [
      { name: '完成项目周报', dimension: 'work', time: '09:00', completed: true },
      { name: '回复客户邮件', dimension: 'work', time: '10:30', completed: true },
      { name: '团队站会', dimension: 'work', time: '14:00', completed: false },
      { name: '代码评审', dimension: 'work', time: '16:00', completed: false },
      { name: '阅读《设计模式》第3章', dimension: 'study', time: '20:00', completed: false },
      { name: '背英语单词50个', dimension: 'study', completed: true },
      { name: '晨跑5公里', dimension: 'health', time: '06:30', completed: true },
      { name: '喝水8杯', dimension: 'health', completed: false },
      { name: '买菜', dimension: 'life', time: '18:00', completed: false },
      { name: '给家人打电话', dimension: 'life', completed: false },
    ];
    todayTasks.forEach(t => {
      data.tasks.push({
        id: uuid(),
        name: t.name,
        notes: '',
        dimension: t.dimension,
        date: today,
        time: t.time || '',
        completed: t.completed || false,
        completedAt: t.completed ? Date.now() - Math.random() * 3600000 : null,
        createdAt: Date.now() - Math.random() * 86400000,
        weeklyGoalId: null,
        isMultiDay: false,
        startDate: null,
        endDate: null,
      });
    });

    // 前几天的任务
    if (weekDates[0] !== today) {
      const pastTasks = [
        { name: '需求文档评审', dimension: 'work', completed: true },
        { name: '技术方案设计', dimension: 'work', completed: true },
        { name: '健身房锻炼', dimension: 'health', completed: true },
        { name: '看纪录片', dimension: 'life', completed: false },
      ];
      pastTasks.forEach((t, i) => {
        data.tasks.push({
          id: uuid(),
          name: t.name,
          notes: '',
          dimension: t.dimension,
          date: weekDates[i % 3],
          time: '',
          completed: t.completed,
          completedAt: t.completed ? Date.now() - 86400000 : null,
          createdAt: Date.now() - 86400000 * 2,
          weeklyGoalId: null,
          isMultiDay: false,
          startDate: null,
          endDate: null,
        });
      });
    }

    // 周目标
    const goals = [
      { name: '完成项目第一阶段开发', dimension: 'work' },
      { name: '读完一本书', dimension: 'study' },
      { name: '运动3次', dimension: 'health' },
    ];
    goals.forEach(g => {
      const goalId = uuid();
      const goalTasks = data.tasks.filter(t => t.dimension === g.dimension && weekDates.includes(t.date));
      data.weeklyGoals.push({
        id: goalId,
        name: g.name,
        dimension: g.dimension,
        weekKey: getWeekKey(new Date()),
        taskIds: goalTasks.map(t => t.id),
        createdAt: Date.now() - 86400000 * 3,
      });
      goalTasks.forEach(t => { t.weeklyGoalId = goalId; });
    });

    // 账单
    const bills = [
      { type: 'expense', category: 'food', amount: 28.5, date: today, note: '早餐' },
      { type: 'expense', category: 'food', amount: 45, date: today, note: '午餐外卖' },
      { type: 'expense', category: 'transport', amount: 12, date: today, note: '地铁' },
      { type: 'expense', category: 'shopping', amount: 89.9, date: weekDates[0], note: '买书' },
      { type: 'expense', category: 'food', amount: 120, date: weekDates[1], note: '聚餐' },
      { type: 'expense', category: 'transport', amount: 35, date: weekDates[2], note: '打车' },
      { type: 'expense', category: 'shopping', amount: 199, date: weekDates[0], note: '日用品' },
      { type: 'income', category: 'salary', amount: 5000, date: weekDates[0], note: '工资' },
    ];
    bills.forEach((b, i) => {
      data.bills.push({
        id: uuid(),
        type: b.type,
        category: b.category,
        amount: b.amount,
        date: b.date,
        note: b.note,
        createdAt: Date.now() - i * 3600000,
      });
    });

    // 灵感
    data.inspirations.push({
      id: uuid(),
      content: '是否可以用自动化脚本处理重复性数据整理工作？',
      type: 'idea',
      date: today,
      createdAt: Date.now() - 7200000,
    });

    // 便利贴
    data.stickyNotes = '记得周五前提交报销单\n下周二有产品评审会\n考虑换一个更好用的笔记工具';

    // 复盘备忘
    data.reviewMemos['week_' + getWeekKey(new Date())] = '本周整体节奏不错，工作推进顺利。健康维度还需加强，下周争取运动3次以上。';

    save();
  }

  init();
  seedDemoData();

  return {
    Tasks,
    WeeklyGoals,
    Bills,
    Inspirations,
    Milestones,
    FocusSessions,
    Supplements,
    Reading,
    Health,
    ReviewMemos,
    StickyNotes,
    Settings,
    RecycleBin,
    IO,
    DateUtils,
    getRawData: () => data,
    save,
  };
})();

const { streamChat } = require('./chat_stream_client');
const { createInitialChatState, reduceChatEvent } = require('./chat_event_state');
const { buildChatViewModel } = require('./chat_ui_model');
const { fixtureEventsFor } = require('./chat_ui_fixtures');

const USER_ID_KEY = 'travel_stay_user_id';
const DEFAULT_PROMPT = '我计划 7 月 10 日到 12 日去海口，2 人住 2 晚，每晚预算 1200 元以内，想打高尔夫，也需要方便前往海口东站，可以接受自驾。';

function $(selector, root = document) {
  return root.querySelector(selector);
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
}

function clear(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

function safeText(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function formatNumber(value, suffix = '') {
  return typeof value === 'number' ? `${Math.round(value * 10) / 10}${suffix}` : '';
}

function getStableUserId() {
  try {
    const existing = localStorage.getItem(USER_ID_KEY);
    if (existing) return existing;
    const id = `anon-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
    localStorage.setItem(USER_ID_KEY, id);
    return id;
  } catch (_error) {
    return 'anon-browser-session';
  }
}

function sectionTitle(title, subtitle) {
  const header = createElement('div', 'section-heading');
  header.appendChild(createElement('h2', '', title));
  if (subtitle) header.appendChild(createElement('p', '', subtitle));
  return header;
}

function chip(label) {
  return createElement('span', 'chip', label);
}

function renderChips(container, labels) {
  clear(container);
  for (const label of labels || []) container.appendChild(chip(label));
}

function routeLine(route) {
  const item = createElement('div', 'route-line');
  const name = createElement('span', 'route-place', route.place_name || route.place_id || '目标地点');
  const meta = createElement('span', 'route-meta');
  const duration = formatNumber(route.duration_minutes, ' 分钟');
  const distance = formatNumber(route.distance_km, ' km');
  meta.textContent = [duration, distance].filter(Boolean).join(' · ');
  item.append(name, meta);
  return item;
}

function statusFriendlyError(error) {
  if (!error) return '请求失败，请稍后再试。';
  if (error.code === 'HTTP_ERROR' && error.details?.body?.includes('SERVER_CONFIG_MISSING')) {
    return '服务暂未完成配置，请稍后再试。';
  }
  if (error.code === 'REQUEST_ABORTED') return '已取消本次分析。';
  if (error.code === 'EMPTY_RESPONSE_BODY') return '服务返回为空，请稍后再试。';
  return error.message || '请求失败，请稍后再试。';
}

class TravelStayApp {
  constructor(root) {
    this.root = root;
    this.state = createInitialChatState();
    this.conversationId = '';
    this.userId = getStableUserId();
    this.abortController = null;
    this.renderedReasons = new Map();
    this.renderedAlternatives = new Map();
    this.demoMode = new URLSearchParams(window.location.search).has('demo');
    this.nodes = {};
  }

  init() {
    this.root.innerHTML = this.shellHtml();
    this.collectNodes();
    this.bindEvents();
    this.render(this.state);
  }

  shellHtml() {
    return `
      <header class="site-header">
        <div class="brand-block">
          <div class="brand-mark">旅策</div>
          <div>
            <p class="eyebrow">住宿决策智能体</p>
            <h1>基于 RAG 与多源 API 协同的住宿决策智能体</h1>
          </div>
        </div>
        <div class="header-meta">课程演示项目</div>
      </header>

      <main class="page-shell">
        <section class="hero-panel">
          <div class="hero-copy">
            <p class="eyebrow">Haikou stay planning</p>
            <h2>把旅行目标、预算、路线和天气放在同一个决策页面里。</h2>
            <p>输入自然语言需求，系统会流式生成结构化住宿建议。组件会随着业务事件到达逐步出现。</p>
          </div>
          <form class="request-card" id="request-form">
            <label for="travel-query">告诉我们你的旅行计划</label>
            <p class="form-help">输入日期、人数、预算、主要活动地点和旅行偏好。</p>
            <textarea id="travel-query" rows="7" placeholder="${DEFAULT_PROMPT}"></textarea>
            <div class="quick-prompts" aria-label="示例需求">
              <button type="button" data-prompt="度假与高尔夫">度假与高尔夫</button>
              <button type="button" data-prompt="商务交通优先">商务交通优先</button>
              <button type="button" data-prompt="预算友好型">预算友好型</button>
            </div>
            <div class="form-actions">
              <button class="primary-button" type="submit" id="submit-button">开始分析</button>
              <button class="secondary-button" type="button" id="cancel-button" disabled>取消</button>
              <button class="ghost-button" type="button" id="new-session-button">开始新的咨询</button>
            </div>
          </form>
        </section>

        <section class="demo-panel hidden" id="demo-panel" aria-label="流式组件验证">
          <span>开发验证流</span>
          <button type="button" data-fixture="normal">正常推荐</button>
          <button type="button" data-fixture="no_candidate">零候选</button>
          <button type="button" data-fixture="unsupported_city">城市不支持</button>
          <button type="button" data-fixture="invalid_trip_date">日期无效</button>
          <button type="button" data-fixture="clarification_required">需要澄清</button>
        </section>

        <section class="status-region" aria-live="polite" aria-atomic="false">
          <div class="status-pill" id="status-pill">
            <span class="status-dot"></span>
            <span id="status-text">准备开始</span>
          </div>
          <span class="conversation-id hidden" id="conversation-id"></span>
        </section>

        <section class="error-panel hidden" id="error-panel" aria-live="assertive"></section>
        <section class="exception-region hidden" id="exception-region"></section>
        <section class="results-grid" id="results-grid">
          <div class="primary-region" id="primary-region"></div>
          <div class="reasons-region" id="reasons-region"></div>
          <div class="alternatives-region" id="alternatives-region"></div>
          <div class="route-region" id="route-region"></div>
          <div class="weather-region" id="weather-region"></div>
          <div class="notice-region" id="notice-region"></div>
        </section>
      </main>
      <footer class="site-footer">数据用于课程演示；真实预订前请以正式渠道为准。</footer>
    `;
  }

  collectNodes() {
    this.nodes.form = $('#request-form', this.root);
    this.nodes.textarea = $('#travel-query', this.root);
    this.nodes.submit = $('#submit-button', this.root);
    this.nodes.cancel = $('#cancel-button', this.root);
    this.nodes.newSession = $('#new-session-button', this.root);
    this.nodes.statusPill = $('#status-pill', this.root);
    this.nodes.statusText = $('#status-text', this.root);
    this.nodes.conversation = $('#conversation-id', this.root);
    this.nodes.error = $('#error-panel', this.root);
    this.nodes.exception = $('#exception-region', this.root);
    this.nodes.primary = $('#primary-region', this.root);
    this.nodes.reasons = $('#reasons-region', this.root);
    this.nodes.alternatives = $('#alternatives-region', this.root);
    this.nodes.route = $('#route-region', this.root);
    this.nodes.weather = $('#weather-region', this.root);
    this.nodes.notice = $('#notice-region', this.root);
    this.nodes.demo = $('#demo-panel', this.root);
    if (this.demoMode) this.nodes.demo.classList.remove('hidden');
  }

  bindEvents() {
    this.nodes.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.startAnalysis(this.nodes.textarea.value.trim());
    });
    this.nodes.cancel.addEventListener('click', () => this.cancelCurrent());
    this.nodes.newSession.addEventListener('click', () => this.resetSession());
    this.root.querySelectorAll('[data-prompt]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.getAttribute('data-prompt');
        const prompts = {
          '度假与高尔夫': DEFAULT_PROMPT,
          '商务交通优先': '我下周去海口出差，2 人住 1 晚，预算 800 元以内，希望交通方便，靠近国贸或海口东站，最好适合商务会面。',
          '预算友好型': '我和朋友去海口短途旅行，2 人住 2 晚，每晚预算 400 元以内，想逛骑楼老街和吃本地美食，希望交通方便。',
        };
        this.nodes.textarea.value = prompts[value] || DEFAULT_PROMPT;
        this.nodes.textarea.focus();
      });
    });
    this.nodes.demo.querySelectorAll('[data-fixture]').forEach((button) => {
      button.addEventListener('click', () => this.runFixture(button.getAttribute('data-fixture')));
    });
  }

  resetRenderedLists() {
    this.renderedReasons.clear();
    this.renderedAlternatives.clear();
    clear(this.nodes.reasons);
    clear(this.nodes.alternatives);
  }

  resetResultDom() {
    this.resetRenderedLists();
    clear(this.nodes.primary);
    clear(this.nodes.route);
    clear(this.nodes.weather);
    clear(this.nodes.notice);
    clear(this.nodes.exception);
    this.nodes.exception.classList.add('hidden');
    clear(this.nodes.error);
    this.nodes.error.classList.add('hidden');
  }

  resetForNewResponse() {
    this.state = createInitialChatState();
    this.resetResultDom();
    this.render(this.state);
  }

  resetSession() {
    this.cancelCurrent();
    this.conversationId = '';
    this.resetForNewResponse();
    this.nodes.textarea.focus();
  }

  cancelCurrent() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.nodes.cancel.disabled = true;
    this.nodes.submit.disabled = false;
    this.nodes.submit.textContent = '开始分析';
  }

  async startAnalysis(query) {
    if (!query) {
      this.showError({ code: 'EMPTY_QUERY', message: '请先输入旅行计划。' });
      this.nodes.textarea.focus();
      return;
    }

    this.cancelCurrent();
    this.resetForNewResponse();
    this.abortController = new AbortController();
    this.nodes.submit.disabled = true;
    this.nodes.submit.textContent = '分析中…';
    this.nodes.cancel.disabled = false;

    try {
      await streamChat({
        query,
        conversationId: this.conversationId,
        user: this.userId,
        inputs: {},
        signal: this.abortController.signal,
        onConversationId: (conversationId) => {
          this.conversationId = conversationId;
          this.renderConversationId(conversationId);
        },
        onStateChange: (state) => {
          this.state = state;
          this.render(state);
        },
        onError: (error) => this.showError(error),
      });
    } catch (error) {
      this.showError(error);
    } finally {
      this.abortController = null;
      this.nodes.submit.disabled = false;
      this.nodes.submit.textContent = this.state.awaitingUserInput ? '继续分析' : '开始分析';
      this.nodes.cancel.disabled = true;
    }
  }

  runFixture(name) {
    this.cancelCurrent();
    this.resetForNewResponse();
    this.state = { ...this.state, streamStatus: 'streaming' };
    this.render(this.state);
    const events = fixtureEventsFor(name);
    let index = 0;
    const step = () => {
      if (index >= events.length) return;
      this.state = reduceChatEvent(this.state, events[index]);
      this.render(this.state);
      index += 1;
      if (index < events.length) window.setTimeout(step, 320);
    };
    window.setTimeout(step, 260);
  }

  render(state) {
    const view = buildChatViewModel(state);
    this.renderStatus(view);
    this.renderConversationId(view.conversationId);
    this.renderException(view.exception);
    this.renderPrimary(view.primaryRecommendation);
    this.renderReasons(view.recommendationReasons);
    this.renderAlternatives(view.alternativeRecommendations);
    this.renderRoute(view.route);
    this.renderWeather(view.weather);
    this.renderNotice(view.dataNotice);
    this.renderProtocolErrors(view.protocolErrors);
  }

  renderStatus(view) {
    this.nodes.statusText.textContent = view.status.label;
    this.nodes.statusPill.dataset.tone = view.status.tone;
  }

  renderConversationId(conversationId) {
    if (!conversationId) {
      this.nodes.conversation.classList.add('hidden');
      this.nodes.conversation.textContent = '';
      return;
    }
    this.nodes.conversation.classList.remove('hidden');
    this.nodes.conversation.textContent = `会话已建立`;
  }

  showError(error) {
    this.nodes.error.classList.remove('hidden');
    clear(this.nodes.error);
    const title = createElement('strong', '', '请求暂时无法完成');
    const detail = createElement('p', '', statusFriendlyError(error));
    this.nodes.error.append(title, detail);
  }

  renderProtocolErrors(errors) {
    if (!errors || errors.length === 0) return;
    this.nodes.error.classList.remove('hidden');
    clear(this.nodes.error);
    this.nodes.error.append(
      createElement('strong', '', '流式协议提示'),
      createElement('p', '', '部分内容解析遇到问题，已保留此前成功到达的结果。'),
    );
  }

  renderException(exception) {
    if (!exception) {
      this.nodes.exception.classList.add('hidden');
      clear(this.nodes.exception);
      return;
    }
    this.nodes.exception.classList.remove('hidden');
    clear(this.nodes.exception);
    const card = createElement('article', `exception-card ${exception.type}`);
    card.appendChild(createElement('h2', '', exception.title));
    const payload = exception.payload || {};

    if (exception.type === 'unsupported_city') {
      card.appendChild(createElement('p', '', payload.message || '当前城市暂未支持。'));
      const cities = Array.isArray(payload.supported_cities) ? payload.supported_cities.join('、') : '海口';
      card.appendChild(createElement('p', 'muted', `当前支持：${cities}`));
    } else if (exception.type === 'invalid_trip_date') {
      card.appendChild(createElement('p', '', payload.message || '请调整旅行日期。'));
    } else if (exception.type === 'clarification_required') {
      card.appendChild(createElement('p', '', payload.message || '请补充更多信息。'));
      if (payload.awaiting_user_input === true) {
        card.appendChild(createElement('p', 'muted', '你可以直接在上方输入框继续补充，本页面会续传当前会话。'));
      }
    } else if (exception.type === 'no_candidate') {
      card.appendChild(createElement('p', '', payload.summary || '没有找到符合条件的酒店。'));
      if (payload.detail) card.appendChild(createElement('p', 'muted', payload.detail));
      if (payload.active_constraints && typeof payload.active_constraints === 'object') {
        const list = createElement('div', 'constraint-list');
        Object.entries(payload.active_constraints).forEach(([key, value]) => {
          list.appendChild(createElement('span', 'constraint-chip', `${key}: ${value}`));
        });
        card.appendChild(list);
      }
      if (Array.isArray(payload.suggestions) && payload.suggestions.length > 0) {
        const suggestions = createElement('div', 'suggestion-grid');
        payload.suggestions.forEach((suggestion) => {
          const item = createElement('div', 'suggestion-card');
          item.append(
            createElement('strong', '', suggestion.label || suggestion.field || '建议'),
            createElement('p', '', suggestion.content || ''),
          );
          suggestions.appendChild(item);
        });
        card.appendChild(suggestions);
      }
    }
    this.nodes.exception.appendChild(card);
  }

  renderPrimary(primary) {
    if (!primary) {
      clear(this.nodes.primary);
      return;
    }
    if (!this.nodes.primary.firstChild) {
      const card = createElement('article', 'primary-card reveal');
      card.innerHTML = `
        <div class="card-accent"></div>
        <div class="card-badge">首选推荐</div>
        <h2 class="hotel-name"></h2>
        <p class="hotel-meta"></p>
        <div class="chip-row"></div>
        <p class="summary"></p>
        <div class="tradeoff-block"><span>主要取舍</span><p></p></div>
      `;
      this.nodes.primary.appendChild(card);
    }
    const card = this.nodes.primary.firstChild;
    $('.hotel-name', card).textContent = primary.hotel.name;
    $('.hotel-meta', card).textContent = [primary.hotel.hotelType, primary.hotel.area, primary.hotel.subArea].filter(Boolean).join(' · ');
    renderChips($('.chip-row', card), primary.hotel.chips);
    $('.summary', card).textContent = primary.summary;
    $('.tradeoff-block p', card).textContent = primary.tradeoff;
  }

  renderReasons(reasons) {
    if (!reasons || reasons.length === 0) {
      clear(this.nodes.reasons);
      this.renderedReasons.clear();
      return;
    }
    if (!this.nodes.reasons.querySelector('.section-heading')) {
      this.nodes.reasons.appendChild(sectionTitle('为什么推荐它', '每条理由来自独立业务事件，到达后立即追加。'));
      this.nodes.reasons.appendChild(createElement('div', 'reason-grid'));
    }
    const grid = $('.reason-grid', this.nodes.reasons);
    reasons.forEach((reason) => {
      if (this.renderedReasons.has(reason.key)) return;
      const card = createElement('article', 'reason-card reveal');
      card.innerHTML = `
        <div class="reason-top">
          <span class="dimension-pill"></span>
        </div>
        <h3></h3>
        <p></p>
      `;
      $('.dimension-pill', card).textContent = reason.presentation.label;
      $('h3', card).textContent = reason.title;
      $('p', card).textContent = reason.content;
      grid.appendChild(card);
      this.renderedReasons.set(reason.key, card);
    });
  }

  renderAlternatives(alternatives) {
    if (!alternatives || alternatives.length === 0) {
      clear(this.nodes.alternatives);
      this.renderedAlternatives.clear();
      return;
    }
    if (!this.nodes.alternatives.querySelector('.section-heading')) {
      this.nodes.alternatives.appendChild(sectionTitle('其他值得考虑的选择'));
      this.nodes.alternatives.appendChild(createElement('div', 'alternative-grid'));
    }
    const grid = $('.alternative-grid', this.nodes.alternatives);
    alternatives.forEach((alternative) => {
      if (this.renderedAlternatives.has(alternative.key)) return;
      const card = createElement('article', 'alternative-card reveal');
      const chips = createElement('div', 'chip-row compact');
      renderChips(chips, alternative.hotel.chips.slice(0, 4));
      card.append(
        createElement('span', 'alternative-label', alternative.label || '备选方案'),
        createElement('h3', '', alternative.hotel.name),
        createElement('p', 'hotel-meta', [alternative.hotel.area, alternative.hotel.subArea].filter(Boolean).join(' · ')),
        chips,
        createElement('p', '', alternative.fitFor),
        createElement('p', 'muted', alternative.reason),
        createElement('p', 'tradeoff-text', alternative.tradeoff),
      );
      if (alternative.route?.fastestRoute) {
        const route = createElement('p', 'route-highlight', `最快相关路线：${alternative.route.fastestRoute.place_name} · ${formatNumber(alternative.route.fastestRoute.duration_minutes, ' 分钟')}`);
        card.appendChild(route);
      }
      grid.appendChild(card);
      this.renderedAlternatives.set(alternative.key, card);
    });
  }

  renderRoute(routeView) {
    if (!routeView) {
      clear(this.nodes.route);
      return;
    }
    clear(this.nodes.route);
    const section = createElement('section', 'analysis-card reveal');
    section.appendChild(sectionTitle('交通与路线', '路线数字来自结构化 route_matrix，解释来自路线建议事件。'));
    if (routeView.valid === false) {
      section.appendChild(createElement('p', 'muted', '路线矩阵暂不可用，本次不展示路线数字。'));
    } else {
      const grid = createElement('div', 'route-stats-grid');
      routeView.stats.forEach((stat) => {
        const card = createElement('article', 'route-stat-card');
        card.append(
          createElement('h3', '', stat.hotelName),
          createElement('p', 'route-rank', stat.routeRank ? `路线排序 #${stat.routeRank}` : '路线排序待定'),
          createElement('p', 'metric-line', [
            formatNumber(stat.averageDurationMinutes, ' 分钟平均车程'),
            formatNumber(stat.averageDistanceKm, ' km 平均距离'),
          ].filter(Boolean).join(' · ')),
        );
        const routeList = createElement('div', 'route-lines');
        stat.routes.slice(0, 4).forEach((route) => routeList.appendChild(routeLine(route)));
        card.appendChild(routeList);
        grid.appendChild(card);
      });
      section.appendChild(grid);
    }
    if (routeView.advice) {
      const advice = createElement('div', 'advice-block');
      advice.append(createElement('strong', '', '路线建议'), createElement('p', '', routeView.advice));
      section.appendChild(advice);
    }
    this.nodes.route.appendChild(section);
  }

  renderWeather(weather) {
    if (!weather) {
      clear(this.nodes.weather);
      return;
    }
    clear(this.nodes.weather);
    const section = createElement('section', `analysis-card weather-card reveal ${weather.available ? '' : 'degraded'}`);
    section.appendChild(sectionTitle('天气与出行提示'));
    const fact = createElement('div', 'weather-fact');
    fact.append(
      createElement('strong', '', weather.available ? '天气上下文可用' : '天气数据降级'),
      createElement('p', '', weather.context || '当前没有可用天气上下文。'),
    );
    section.appendChild(fact);
    if (weather.advice) {
      const advice = createElement('div', 'advice-block');
      advice.append(createElement('strong', '', '天气建议'), createElement('p', '', weather.advice));
      section.appendChild(advice);
    }
    this.nodes.weather.appendChild(section);
  }

  renderNotice(notice) {
    if (!notice) {
      clear(this.nodes.notice);
      return;
    }
    clear(this.nodes.notice);
    const card = createElement('aside', 'data-notice reveal');
    card.append(createElement('strong', '', '数据说明'), createElement('p', '', notice.content || ''));
    this.nodes.notice.appendChild(card);
  }
}

function initTravelStayApp(rootSelector = '#app') {
  const root = $(rootSelector);
  if (!root) return null;
  const app = new TravelStayApp(root);
  app.init();
  return app;
}

if (typeof window !== 'undefined') {
  window.TravelStayAgentApp = {
    TravelStayApp,
    initTravelStayApp,
  };
}

module.exports = {
  TravelStayApp,
  initTravelStayApp,
};

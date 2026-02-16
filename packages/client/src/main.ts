import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import LoginView from './views/LoginView.vue';
import ProjectsView from './views/ProjectsView.vue';
import ProjectView from './views/ProjectView.vue';
import NamespaceView from './views/NamespaceView.vue';
import { authService } from './services/api';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/projects' },
    { path: '/login', component: LoginView },
    { path: '/projects', component: ProjectsView, meta: { requiresAuth: true } },
    { path: '/projects/:id', component: ProjectView, meta: { requiresAuth: true } },
    { path: '/namespaces/:id', component: NamespaceView, meta: { requiresAuth: true } },
  ],
});

router.beforeEach((to, from, next) => {
  if (to.meta.requiresAuth && !authService.isAuthenticated()) {
    next('/login');
  } else if (to.path === '/login' && authService.isAuthenticated()) {
    next('/projects');
  } else {
    next();
  }
});

const app = createApp(App);
app.use(router);
app.mount('#app');

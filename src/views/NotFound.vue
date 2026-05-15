<template>
  <section class="page_404 flex items-center justify-center min-h-[80vh]">
    <div class="container mx-auto">
      <div class="row">
        <div class="col-sm-12 text-center">
          <div class="four_zero_four_bg">
            <h1 class="text-center">404</h1>
          </div>
          <div class="contant_box_404">
            <h3 class="h2 text-2xl font-bold text-slate-800">
              Look like you're lost
            </h3>
            <p class="text-slate-500 mt-2">the page you are looking for not avaible!</p>
            <router-link to="/" class="link_404 rounded-md shadow-md hover:bg-[#2e8a27] transition-colors font-bold">
              Go to Home
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Arvo:wght@400;700&display=swap');

.page_404 {
  padding: 40px 0;
  background: #fff;
  font-family: 'Arvo', serif;
}

.page_404 img {
  width: 100%;
}

.four_zero_four_bg {
  background-image: url('https://cdn.dribbble.com/users/285475/screenshots/2083086/dribbble_1.gif');
  height: 400px;
  background-position: center;
  background-repeat: no-repeat;
}

.four_zero_four_bg h1 {
  font-size: 80px;
  color: #333;
  margin: 0;
}

.link_404 {
  color: #fff !important;
  padding: 10px 20px;
  background: #39ac31;
  margin: 20px 0;
  display: inline-block;
  text-decoration: none;
}

.contant_box_404 {
  margin-top: -50px;
}
</style>
